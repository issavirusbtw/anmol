// Renderer, post-processing, light hierarchy, live light pool and adaptive resolution.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BokehShader } from 'three/examples/jsm/shaders/BokehShader.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Lamp } from '../world/builder';

/** Bokeh depth of field fed by the main render's own depth buffer, so it costs no second scene render. */
class DofPass extends ShaderPass {
  constructor(private cam: THREE.PerspectiveCamera) {
    // sharp band: everything from the lens to focus+band stays crisp (signs, other players); only the far world softens
    super(
      {
        ...BokehShader,
        defines: { DEPTH_PACKING: 0, PERSPECTIVE_CAMERA: 1 },
        uniforms: { ...BokehShader.uniforms, band: { value: 9 } },
        fragmentShader: BokehShader.fragmentShader
          .replace('uniform float focus;', 'uniform float focus;\nuniform float band;')
          .replace('float factor = ( focus + viewZ );', 'float factor = -max( 0.0, -viewZ - focus - band );'),
      },
      'tColor',
    );
  }
  render(r: THREE.WebGLRenderer, w: THREE.WebGLRenderTarget, rb: THREE.WebGLRenderTarget, dt: number, mask: boolean): void {
    const u = this.uniforms as Record<string, THREE.IUniform>;
    u.tDepth.value = rb.depthTexture;
    u.nearClip.value = this.cam.near;
    u.farClip.value = this.cam.far;
    u.aspect.value = rb.width / rb.height;
    super.render(r, w, rb, dt, mask);
  }
}

/** Full-strength key light; the giant's shadow scales it down. */
export const KEY_INTENSITY = 2.6;
/** Tone-mapping exposure inside the cabinet. */
export const INSIDE_EXPOSURE = 1.12;

export class Renderer {
  gl: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  bokeh: DofPass;
  grade: ShaderPass;
  fxaa: ShaderPass;
  camera: THREE.PerspectiveCamera;
  moon: THREE.DirectionalLight;
  roomLamp: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  pool: THREE.PointLight[] = [];
  lamps: Lamp[] = [];
  low: boolean;
  resScale = 1;
  private frameTimes: number[] = [];
  fps = 0;
  avgFrameMs = 0;
  rendererInfo = '';
  private poolTimer = 0;
  /** global dimming used when the giant's shadow passes */
  dim = 1;

  constructor(
    public scene: THREE.Scene,
    canvas: HTMLCanvasElement,
    low: boolean,
  ) {
    this.low = low;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.gl.setSize(window.innerWidth, window.innerHeight, false);
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = INSIDE_EXPOSURE;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    const dbg = this.gl.getContext().getExtension('WEBGL_debug_renderer_info');
    this.rendererInfo = dbg ? String(this.gl.getContext().getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.08, 1400);

    const pmrem = new THREE.PMREMGenerator(this.gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.5;
    scene.background = new THREE.Color(0x2a2520);
    // warm dusty haze: distant tiers fade into air instead of into black
    scene.fog = new THREE.FogExp2(0x6e6455, 0.0042);

    // light hierarchy: the giant's warm desk lamp through the glass (shadowed key), cool window fill, bright bounce
    this.hemi = new THREE.HemisphereLight(0xc4d6f2, 0x6b5038, 0.7);
    scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0xffdcae, KEY_INTENSITY);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
    const sc = this.moon.shadow.camera;
    sc.left = -34;
    sc.right = 34;
    sc.top = 34;
    sc.bottom = -34;
    sc.near = 1;
    sc.far = 400;
    this.moon.shadow.bias = -0.0006;
    this.moon.shadow.normalBias = 0.06;
    scene.add(this.moon, this.moon.target);
    this.roomLamp = new THREE.DirectionalLight(0x9fbbe8, 0.7);
    this.roomLamp.position.set(-230, 120, 90);
    scene.add(this.roomLamp);

    const N = low ? 5 : 9;
    for (let i = 0; i < N; i++) {
      const p = new THREE.PointLight(0xffb060, 0, 8, 2);
      p.castShadow = false;
      scene.add(p);
      this.pool.push(p);
    }

    // both ping-pong targets carry a depth texture: the scene pass lands in whichever is the read buffer that frame
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1) });
    this.composer = new EffectComposer(this.gl, rt);
    this.composer.addPass(new RenderPass(scene, this.camera));
    // threshold is in linear HDR: above the brightest key-lit white wall, so only lamps and emissives glow
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.55, 1.6);
    this.composer.addPass(this.bloom);
    // macro lens: focus tracks the character (set per frame by the game), the far world softens
    this.bokeh = new DofPass(this.camera);
    const bu = this.bokeh.uniforms as Record<string, THREE.IUniform>;
    bu.aperture.value = 0.0009;
    bu.maxblur.value = 0.014;
    this.bokeh.enabled = false;
    this.composer.addPass(this.bokeh);
    this.composer.addPass(new OutputPass());
    // display-space grade: a little richer colour and contrast, soft vignette
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, sat: { value: 1.18 }, contrast: { value: 1.07 }, vig: { value: 0.32 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, contrast, vig; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tDiffuse, vUv);
          float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
          c.rgb = mix(vec3(l), c.rgb, sat);
          c.rgb = (c.rgb - 0.5) * contrast + 0.5;
          vec2 d = vUv - 0.5;
          c.rgb *= 1.0 - vig * dot(d, d) * 2.0;
          gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
        }`,
    });
    this.composer.addPass(this.grade);
    // the canvas antialias flag does nothing once post renders off-screen; 4x MSAA measured +10 ms, FXAA is near free
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);

    window.addEventListener('resize', () => this.resize());
    if (low) this.setQuality(true);
    else this.resize();
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = Math.min(window.devicePixelRatio, 2) * this.resScale;
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    (this.fxaa.uniforms as Record<string, THREE.IUniform>).resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }

  setQuality(low: boolean): void {
    this.low = low;
    this.bloom.enabled = !low;
    this.moon.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
    this.moon.shadow.map?.dispose();
    this.moon.shadow.map = null;
    this.resScale = low ? 0.75 : 1;
    this.resize();
  }

  /** Keep the shadow frustum centred on what the camera sees. */
  follow(target: THREE.Vector3): void {
    const t = target;
    // low, raking angle through the glass: fronts of each tier catch it, backs fall into shadow
    this.moon.target.position.set(Math.round(t.x), Math.round(t.y), Math.round(t.z));
    this.moon.position.set(Math.round(t.x) - 50, Math.round(t.y) + 70, Math.round(t.z) + 160);
  }

  /** Assign the live point lights to the nearest active lamps. */
  updatePool(focus: THREE.Vector3, dt: number, time: number): void {
    this.poolTimer -= dt;
    if (this.poolTimer <= 0) {
      this.poolTimer = 0.25;
      const cand = this.lamps
        .filter((l) => l.on && l.intensity > 0)
        .map((l) => ({ l, d: l.pos.distanceToSquared(focus) / (l.intensity * l.range) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, this.pool.length);
      this.pool.forEach((p, i) => {
        const c = cand[i];
        (p as any).__lamp = c ? c.l : null;
        if (c) {
          p.position.copy(c.l.pos);
          p.color.copy(c.l.color);
          p.distance = c.l.range;
        }
      });
    }
    for (const p of this.pool) {
      const l: Lamp | null = (p as any).__lamp;
      let target = l ? l.intensity * 3.4 * this.dim : 0;
      if (l?.flicker) target *= 1 - l.flicker * 0.5 * (Math.sin(time * 13 + l.pos.x) * 0.5 + 0.5) * (Math.sin(time * 7.3 + l.pos.z) * 0.5 + 0.5);
      p.intensity += (target - p.intensity) * Math.min(1, dt * 8);
    }
  }

  render(dt: number): void {
    this.gl.info.autoReset = false;
    this.gl.info.reset();
    this.composer.render(dt);
    // frame statistics + adaptive resolution
    this.frameTimes.push(dt * 1000);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.avgFrameMs = avg;
    this.fps = 1000 / avg;
  }

  adapt(enabled: boolean): void {
    if (!enabled || this.frameTimes.length < 90) return;
    const avg = this.avgFrameMs;
    const minScale = this.low ? 0.5 : 0.6;
    if (avg > 21 && this.resScale > minScale) {
      this.resScale = Math.max(minScale, this.resScale - 0.1);
      this.frameTimes.length = 0;
      this.resize();
    } else if (avg < 13 && this.resScale < (this.low ? 0.75 : 1)) {
      this.resScale = Math.min(this.low ? 0.75 : 1, this.resScale + 0.05);
      this.frameTimes.length = 0;
      this.resize();
    }
  }
}
