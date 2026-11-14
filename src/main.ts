import { Game } from './game';
import { readParams, GAME_NAME } from './config';

document.title = GAME_NAME;
const params = readParams();
const game = new Game(params, document.getElementById('view') as HTMLCanvasElement, document.getElementById('ui') as HTMLDivElement);
(window as any).__game = game;
game.start();
