import './style.css';
import './ui/polish.css';
import './ui/home.css';
import './ui/briefing.css';
import './ui/results.css';
import './ui/orders.css';
import { Game } from './game/Game';
new Game(document.querySelector<HTMLElement>('#app')!);
