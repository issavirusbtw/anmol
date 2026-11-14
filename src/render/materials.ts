// Material library. Every world material uses vertex colours so tint variety costs no extra draw calls.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import * as T from './textures';

export type MatKey =
  | 'cardboard'
  | 'corrugated'
  | 'painted'
  | 'foil'
  | 'fabric'
  | 'wood'
  | 'cabinetWood'
  | 'plastic'
  | 'plasticGloss'
  | 'plasticClear'
  | 'metal'
  | 'brass'
  | 'gold'
  | 'tape'
  | 'paper'
  | 'wrapper'
  | 'label'
  | 'sign'
  | 'moss'
  | 'crumb'
  | 'thread'
  | 'rubber'
  | 'glow'
  | 'glowSoft'
  | 'glassShelf'
  | 'water'
  | 'velvet'
  | 'pearl'
  | 'candy'
  | 'carpet'
  | 'roomWall'
  | 'matte';

export interface MatInfo {
  mat: THREE.Material;
  /** World units covered by one texture repeat (for UV scaling). 0 = use raw 0..1 UVs. */
  texWorld: number;
  castShadow: boolean;
  receiveShadow: boolean;
  transparent?: boolean;
}

export class Materials {
  lib = new Map<MatKey, MatInfo>();
  signs!: ReturnType<typeof T.signAtlas>;
  fabricTex!: T.TexSet;
  envMap: THREE.Texture | null = null;

  constructor(seed: number, low: boolean) {
    const rng = new Rng(seed).fork('textures');
    const S = low ? 256 : 512;
    const card = T.cardboard(S, rng.fork('card'));
    const corr = T.corrugated(S / 2, rng.fork('corr'));
    const paint = T.paintedBoard(S, rng.fork('paint'));
    const foil = T.foil(S, rng.fork('foil'));
    const fab = T.fabric(S / 2, rng.fork('fabric'));
    this.fabricTex = fab;
    const wood = T.wood(S, rng.fork('wood'), false);
    const cab = T.wood(S, rng.fork('cab'), true);
    const plas = T.plastic(S / 2, rng.fork('plastic'));
    const metal = T.brushedMetal(S / 2, rng.fork('metal'));
    const paper = T.paperScrap(S, rng.fork('paper'));
    const wrap = T.wrapperAtlas(S, rng.fork('wrap'));
    const label = T.labelAtlas(S, rng.fork('label'));
    const moss = T.moss(S / 2, rng.fork('moss'));
    const crumb = T.crumb(S / 2, rng.fork('crumb'));
    this.signs = T.signAtlas();

    const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
    const add = (k: MatKey, mat: THREE.Material, texWorld: number, cast = true, recv = true, transparent = false) =>
      this.lib.set(k, { mat, texWorld, castShadow: cast, receiveShadow: recv, transparent });

    add('cardboard', std({ map: card.map, bumpMap: card.bump, bumpScale: 1.2, roughness: 0.95 }), 6);
    add('corrugated', std({ map: corr.map, bumpMap: corr.bump, bumpScale: 2.0, roughness: 0.95 }), 1.2);
    add('painted', std({ map: paint.map, bumpMap: paint.bump, bumpScale: 0.6, roughness: 0.8 }), 4);
    add('foil', std({ map: foil.map, bumpMap: foil.bump, bumpScale: 2.5, roughnessMap: foil.rough, roughness: 1, metalness: 0.9, envMapIntensity: 5 }), 5);
    add('fabric', std({ map: fab.map, bumpMap: fab.bump, bumpScale: 1.0, roughness: 0.92 }), 1.2);
    add('wood', std({ map: wood.map, bumpMap: wood.bump, bumpScale: 0.8, roughness: 0.7 }), 3);
    add('cabinetWood', std({ map: cab.map, bumpMap: cab.bump, bumpScale: 0.5, roughness: 0.62 }), 24);
    add('plastic', std({ map: plas.map, roughnessMap: plas.rough, roughness: 0.9, metalness: 0 }), 4);
    add('plasticGloss', std({ roughness: 0.18, metalness: 0, envMapIntensity: 1.2 }), 0);
    add(
      'plasticClear',
      std({ roughness: 0.08, metalness: 0, transparent: true, opacity: 0.45, depthWrite: false, envMapIntensity: 1.5 }),
      0,
      false,
      true,
      true,
    );
    add('metal', std({ map: metal.map, roughnessMap: metal.rough, roughness: 1, metalness: 0.85, envMapIntensity: 5 }), 2);
    add('brass', std({ map: metal.map, roughnessMap: metal.rough, roughness: 0.8, metalness: 0.9, color: 0xd9b25a, envMapIntensity: 5 }), 2);
    add('gold', std({ roughness: 0.22, metalness: 1, color: 0xf2c75c, envMapIntensity: 5 }), 0);
    add(
      'tape',
      std({ roughness: 0.35, transparent: true, opacity: 0.55, color: 0xf0e2b0, depthWrite: false }),
      0,
      false,
      true,
      true,
    );
    add('paper', std({ map: paper.map, roughness: 0.9, side: THREE.DoubleSide }), 5);
    add('wrapper', std({ map: wrap.map, bumpMap: wrap.bump, bumpScale: 1.5, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide }), 0);
    add('label', std({ map: label.map, roughness: 0.75 }), 0);
    add('sign', std({ map: this.signs.tex, roughness: 0.8, side: THREE.DoubleSide }), 0);
    add('moss', std({ map: moss.map, bumpMap: moss.bump, bumpScale: 3, roughness: 1 }), 2);
    add('crumb', std({ map: crumb.map, bumpMap: crumb.bump, bumpScale: 3, roughness: 1 }), 1.5);
    add('thread', std({ roughness: 1 }), 0, true, false);
    add('rubber', std({ roughness: 0.85 }), 0);
    add('glow', new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(4, 4, 4) }), 0, false, false);
    add('glowSoft', new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.15, 1.15, 1.15) }), 0, false, false);
    add(
      'glassShelf',
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.05,
        metalness: 0,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        envMapIntensity: 1.4,
      }),
      0,
      false,
      false,
      true,
    );
    add(
      'water',
      std({ roughness: 0.14, metalness: 0.05, transparent: true, opacity: 0.45, color: 0x8fbcd0, depthWrite: false, envMapIntensity: 1 }),
      0,
      false,
      true,
      true,
    );
    add(
      'velvet',
      new THREE.MeshPhysicalMaterial({ vertexColors: true, map: fab.map, roughness: 0.85, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color(0.9, 0.6, 0.7) }),
      1.5,
    );
    add('pearl', new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.25, iridescence: 1, iridescenceIOR: 1.6, clearcoat: 1 }), 0);
    add(
      'candy',
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.12,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        emissive: new THREE.Color(0.18, 0.04, 0.05),
      }),
      0,
    );
    add('carpet', std({ map: fab.map, bumpMap: fab.bump, bumpScale: 4, roughness: 1 }), 30, false, true);
    add('roomWall', std({ map: paint.map, roughness: 0.95 }), 120, false, true);
    add('matte', std({ roughness: 0.85 }), 0);
  }

  get(k: MatKey): MatInfo {
    return this.lib.get(k)!;
  }

  /** UV rectangle for a sign in the atlas (u0, v0, u1, v1). */
  signRect(key: string): [number, number, number, number] {
    const i = this.signs.index.get(key) ?? 0;
    const c = i % this.signs.cols, r = Math.floor(i / this.signs.cols);
    const du = 1 / this.signs.cols, dv = 1 / this.signs.rows;
    return [c * du, 1 - (r + 1) * dv, (c + 1) * du, 1 - r * dv];
  }

  setEnv(env: THREE.Texture): void {
    this.envMap = env;
  }
}

/** Atlas rect for 2x2 atlases (wrapper / label). */
export function quadRect(i: number): [number, number, number, number] {
  const c = i % 2, r = Math.floor(i / 2) % 2;
  return [c * 0.5, 1 - (r + 1) * 0.5, (c + 1) * 0.5, 1 - r * 0.5];
}
