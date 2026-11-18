import { INGREDIENTS, INGREDIENT_COST, STATE_NAMES } from '../game/types';
import { earnedAchievements, ACHIEVEMENT_COUNT } from '../game/achievements';
import type { Level, RunResult } from '../game/types';
import { RECIPES, recipe, recipeEconomy, matchRecipe } from '../cooking/recipes';
import { LEVELS } from '../levels/data';
import { ROUND_SECONDS } from '../game/Simulation';
import type { Simulation } from '../game/Simulation';
import type { Save } from '../game/Save';
import type { Screen } from '../game/Game';
import { iconData, itemData } from '../rendering/art';
import { processIcon, processSteps } from './ProcessIcons';
import { titleArt } from './Title';
import { PATIENCE_SECONDS } from '../restaurant/Restaurant';
export interface Actions { partner(): void; start(id: number): void; pause(): void; resume(): void; menu(): void; restart(): void; recipes(): void; mute(): void; volume(music: number, effects: number): void }
const keys = `<span><kbd>WASD</kbd> / <kbd>↑↓←→</kbd> 移动</span><span><kbd>J</kbd> 拿取 · 放置 · 上菜</span><span><kbd>Space</kbd> 持续加工</span><span><kbd>K</kbd> 冲刺</span><span><kbd>L</kbd> 投掷食材</span><span><kbd>Esc</kbd> 暂停</span>`;
export class UI {
  readonly canvas: HTMLCanvasElement;
  readonly overlay: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly orderIcons = new Map<string, string>();
  private orderKey = '';
  private heldKey = '';
  private readonly ingredientIcons = new Map<string, string>();
  private toastTimer = 0;
  private lastUpdate = 0;
  private result: RunResult | null = null;
  private screenKey = '';
  recipesOpen = false;
  constructor(private readonly root: HTMLElement, private readonly save: Save, actions: Actions) {
    RECIPES.forEach(r => this.orderIcons.set(r.id, iconData(r.id)));
    Object.keys(INGREDIENTS).forEach(kind => this.ingredientIcons.set(kind, iconData(kind, true)));
    root.innerHTML = `<header class="topbar"><button class="brand" data-action="menu" aria-label="返回主菜单"><span class="brand-mark">KC</span><span>KITCHEN CHAOS<small>疯狂厨房</small></span></button><div class="level-heading" id="level-heading">一个人，也能忙得很开心</div><div class="timer-panel play-timer hidden" id="play-timer" aria-label="本局剩余时间"><strong id="timer">05:00</strong><div class="time-track"><i id="time-bar"></i></div></div><nav><button class="icon-button" data-action="recipes">菜谱 <span>R</span></button><button class="icon-button" id="mute" data-action="mute">音乐开</button><button class="icon-button" data-action="pause">暂停 <span>Ⅱ</span></button></nav></header><main class="game-wrap"><div class="stage" id="stage"><canvas id="game" aria-label="疯狂厨房游戏场景" tabindex="0"></canvas><section class="hud hidden" id="hud" aria-label="订单与营业状态"><div class="orders" id="orders" aria-label="当前订单"></div><div class="service-bar"><div class="score-panel"><span class="coin">✦</span><div><strong id="score">0</strong><span id="combo">准备开餐</span></div></div><div class="targets" id="targets"></div></div></section><div class="toast" id="toast" role="status"></div><div class="overlay" id="overlay"></div></div></main><section class="work-status hidden" id="work-status" aria-label="当前操作"><div class="interaction" id="interaction"></div><div class="held-panel" id="held"></div><div class="dash-meter" id="dash">冲刺就绪</div></section><footer class="keybar">${keys}<span class="solo-label">SINGLE PLAYER · 单人厨房</span></footer>`;
    this.canvas = document.querySelector<HTMLCanvasElement>('#game')!;
    this.overlay = document.querySelector<HTMLElement>('#overlay')!;
    this.hud = document.querySelector<HTMLElement>('#hud')!;
    root.addEventListener('click', event => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]'); if (!target || target.hasAttribute('disabled')) return;
      const action = target.dataset.action;
      if (action === 'start') actions.start(Number(target.dataset.level));
      else if (action === 'levels') this.levelSelect();
      else if (action === 'instructions') this.instructions();
      else if (action === 'settings') this.settings();
      else if (action === 'recipes') actions.recipes();
      else if (action === 'partner') actions.partner();
      else if (action === 'pause') actions.pause();
      else if (action === 'resume') actions.resume();
      else if (action === 'restart') actions.restart();
      else if (action === 'menu') actions.menu();
      else if (action === 'mute') { actions.mute(); this.updateMute(); }
      else if (action === 'results' && this.result) this.results(this.result);
    });
    root.addEventListener('input', event => { if ((event.target as HTMLElement).matches('.volume-slider')) { const music = document.querySelector<HTMLInputElement>('#music-volume')!, effects = document.querySelector<HTMLInputElement>('#effects-volume')!; actions.volume(Number(music.value), Number(effects.value)); } });
    window.addEventListener('keydown', event => this.menuKey(event), { capture: true });
    this.updateMute();
  }
  private button(label: string, action: string, primary = false, attrs = ''): string { return `<button class="button ${primary ? 'primary' : ''}" data-action="${action}" ${attrs}>${label}</button>`; }
  private setHudVisible(visible: boolean): void {
    this.hud.classList.toggle('hidden', !visible);
    this.root.classList.toggle('in-kitchen', visible);
    document.querySelector('#play-timer')!.classList.toggle('hidden', !visible);
    document.querySelector('#work-status')!.classList.toggle('hidden', !visible);
  }
  private show(content: string, className = ''): void {
    this.recipesOpen = false;
    this.overlay.innerHTML = content;
    this.root.classList.toggle('home-screen',className==='menu-overlay');
    this.overlay.className = `overlay ${className}`;
    const hint=className==='results-overlay'?'<div class="menu-key-hint">←→ / Tab 选择 · J / Enter 确认 · Esc 返回</div>':className==='briefing-overlay'?'<div class="menu-key-hint">J / Enter / Esc 开餐 · ←→ / Tab 选择 · R 菜谱</div>':'<div class="menu-key-hint">↑↓ / WASD 或 Tab 选择 · J / Enter 确认 · Esc 返回 · R 菜谱</div>';
    (this.overlay.querySelector('.hero-copy')??this.overlay.querySelector('.panel'))!.insertAdjacentHTML('beforeend',hint);
    this.overlay.classList.remove('hidden');
    const first = this.overlay.querySelector<HTMLElement>('.primary, .level-card:not(:disabled)') ?? this.overlay.querySelector<HTMLElement>('button:not(:disabled), input');
    first?.focus({ preventScroll: true });
  }
  private menuKey(event: KeyboardEvent): void {
    if (this.overlay.classList.contains('hidden')) return;
    const code = event.code;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Tab', 'KeyJ', 'Enter', 'Space'].includes(code)) return;
    const controls = [...this.overlay.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
    if (!controls.length) return;
    const focused = document.activeElement as HTMLElement;
    event.stopImmediatePropagation();
    if (focused.matches('input[type="range"]') && ['ArrowLeft', 'ArrowRight'].includes(code)) return;
    event.preventDefault();
    if (code === 'Space') return;
    if (code === 'KeyJ' || code === 'Enter') {
      if (event.repeat) return;
      if (focused.matches('button') && this.overlay.contains(focused)) focused.click();
      else (this.overlay.querySelector<HTMLElement>('.primary') ?? controls[0]).focus();
      return;
    }
    const previous = ['ArrowUp', 'ArrowLeft', 'KeyW', 'KeyA'].includes(code) || (code === 'Tab' && event.shiftKey);
    let step = previous ? -1 : 1;
    const grid = focused.closest('.level-grid');
    if (grid && ['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(code)) step *= getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const index = controls.indexOf(focused);
    controls[(index + step + controls.length) % controls.length]?.focus();
  }
  get inKitchen(): boolean { return !this.hud.classList.contains('hidden'); }
  cameraInsets(): { top: number; bottom: number } {
    const canvas = this.canvas.getBoundingClientRect();
    const orders = document.querySelector('#orders')!.getBoundingClientRect();
    const timer = document.querySelector('#play-timer')!.getBoundingClientRect();
    const status = document.querySelector('.service-bar')!.getBoundingClientRect();
    const top = orders.width > canvas.width * 0.55 ? orders.bottom - canvas.top + 16 : timer.bottom - canvas.top + 16;
    return { top: Math.max(72, top), bottom: status.height + 30 };
  }
  hide(): void { this.recipesOpen = false; this.overlay.classList.add('hidden'); this.canvas.focus(); }
  setScreen(screen: Screen): void {
    if (this.screenKey === screen) return;
    this.screenKey = screen;
    this.root.dataset.screen=screen;
    const button = document.querySelector<HTMLButtonElement>('.topbar nav button:last-child')!;
    button.classList.toggle('hidden', screen !== 'playing' && screen !== 'paused');
    button.dataset.action = screen === 'paused' ? 'resume' : 'pause';
    button.innerHTML = screen === 'paused' ? '继续 <span>▶</span>' : '暂停 <span>Ⅱ</span>';
    button.setAttribute('aria-label', screen === 'paused' ? '继续游戏' : '暂停游戏');
  }
  setPlaying(level: Level): void { this.setHudVisible(true); this.orderKey = '!'; document.querySelector('#orders')!.innerHTML = ''; document.querySelector('#level-heading')!.innerHTML = `<b>0${level.id} / ${level.name}</b><span>${level.english}</span>`; }
  mainMenu(): void {
    this.setHudVisible(false); document.querySelector('#level-heading')!.textContent = '一个人，也能忙得很开心';
    const next = LEVELS.find(l => this.save.unlocked(l.id) && !this.save.data.stars[l.id - 1])?.id ?? 1;
    this.show(`<section class="hero panel"><div class="hero-copy"><span class="eyebrow">单人料理冒险</span><h1 aria-label="Kitchen Chaos!">${titleArt}</h1><h2>疯狂厨房</h2><p class="home-description">系好围裙，开火吧。</p><div class="hero-actions">${this.button(this.save.data.stars.some(Boolean) ? '继续开餐 →' : '开始开餐 →', 'start', true, `data-level="${next}"`)}${this.button('选择关卡', 'levels')}</div><div class="home-tools"><button data-action="mute" data-home-mute>${this.save.data.muted ? '已静音' : '音乐开'}</button><button data-action="recipes">料理手册</button><button data-action="instructions">操作指南</button><button data-action="settings">声音设置</button></div></div><div class="hero-art ai-cover"><img class="cover-art" src="/art/kitchen-cover-v2.png" alt="原创卷发厨师双手托着沙拉，在温暖厨房里迎接开餐" fetchpriority="high" decoding="async"><div class="cover-badge">今天，也要好好吃饭。</div></div></section>`, 'menu-overlay');
  }
  levelSelect(): void {
    this.setHudVisible(false);
    const total = this.save.data.stars.reduce((a, b) => a + b, 0);
    this.show(`<section class="panel wide"><div class="panel-heading"><div><span class="eyebrow">YOUR CULINARY ADVENTURE</span><h2>挑一间厨房，开始忙碌</h2><p>获得一星即可解锁下一关 · 已收集 ${total} / 15 颗星</p></div>${this.button('返回', 'menu')}</div><div class="level-grid">${LEVELS.map(l => {
      const unlocked = this.save.unlocked(l.id), stars = this.save.data.stars[l.id - 1];
      return `<button class="level-card ${unlocked ? '' : 'locked'}" data-action="start" data-level="${l.id}" ${unlocked ? '' : 'disabled'} style="--level-accent:${l.theme.accent};--level-counter:${l.theme.counter}"><div class="level-picture"><span class="level-number">0${l.id}</span><div class="mini-kitchen"><i></i><i></i><i></i><i></i><i></i><i></i><b>${unlocked ? 'KC' : '锁定'}</b></div><span class="level-stars">${[1, 2, 3].map(n => `<i class="${stars >= n ? 'earned' : ''}">★</i>`).join('')}</span></div><div class="level-copy"><small>${l.english}</small><h3>${l.name}</h3><p>${l.subtitle}</p><span>${unlocked ? `最高分 ${this.save.data.scores[l.id - 1]} · ${l.stars.join(' / ')}` : '前一关获得一星后解锁'}</span></div></button>`;
    }).join('')}</div><div class="selection-note">每局 5 分钟 · 所有关卡均可由一名厨师完成</div></section>`);
  }
  partnerMode: 'off' | 'ai' | 'human' = 'off';
  briefing(level: Level): void {
    const lessons = level.id === 1
      ? ['J 拿生菜，放案板，按住 Space 切好。','番茄也切好，两种食材加进同一只盘子。','客人点单后，拿盘到出餐口按 J 上菜。','脏盘自动送到左上角，Space 两秒洗净。']
      : level.id === 4
      ? ['番茄和洋葱先切好，依次放入同一口锅。','食材齐全后自动煮汤，完成后用盘子装走。','通道定时切换，另一条路线始终开放。','脏盘自动回传，左上角按住 Space 清洗。']
      : level.id === 5
      ? ['绿色表示煮好，橙色预警：及时装盘。','烧焦后继续加热会起火，食物需要丢弃。','J 拿灭火器，在起火炉灶旁 Space 三秒。','多炉灶同时烹饪，记得在左上角洗碗。']
      : ['把肉、米饭或面条放入炉灶，自动烹饪。','趁烹饪时切菜，按订单组合到一只盘子。','用干净盘子对着锅里的熟食按 J 装盘。','脏盘自动回传，左上角按住 Space 清洗。'];
    this.show(`<section class="panel briefing"><header class="brief-header"><div><span class="eyebrow">KITCHEN 0${level.id} · ${level.english}</span><h2>${level.name}</h2></div><button class="brief-round brief-mode" type="button" data-action="partner" aria-pressed="${this.partnerMode !== 'off'}" title="点击切换：单人 / 双人（AI 搭档）/ 双人（本地真人）">${this.partnerMode === 'ai' ? '5 分钟 · 双人（AI 搭档）' : this.partnerMode === 'human' ? '5 分钟 · 双人（真人）' : '5 分钟 · 单人'} ⇄</button>${this.partnerMode === 'human' ? '<p class="brief-p2">玩家 1：W A S D · J 拾放 · Space 加工 · K 冲刺 · L 投掷<br>玩家 2：方向键 · . 拾放 · / 加工 · , 冲刺 · ; 投掷</p>' : ''}</header><p class="brief-description">${level.description}</p><div class="brief-body"><section class="brief-steps"><h3>${level.id===1?'先做一份沙拉':level.id===4?'番茄汤与灵活动线':level.id===5?'照顾好炉灶':'边煮边准备'}</h3><ol class="brief-task-list">${lessons.map((text,i)=>`<li><b>${i+1}</b><span>${text}</span></li>`).join('')}</ol></section><aside class="brief-side"><h3>本关菜单</h3><div class="brief-recipes">${level.recipes.map(id=>`<div><img src="${this.orderIcons.get(id)}" alt="${recipe(id).name}"><span>${recipe(id).name}</span></div>`).join('')}</div><div class="brief-controls"><span><kbd>WASD / ↑↓←→</kbd> 移动</span><span><kbd>J</kbd> 拿取 / 上菜</span><span><kbd>Space</kbd> 加工 / 洗碗</span><span><kbd>K</kbd> 冲刺</span><span><kbd>Esc</kbd> 暂停</span></div></aside></div><footer class="brief-footer"><div class="star-goals">${level.stars.map((v,i)=>`<span>${'★'.repeat(i+1)}<b>${v} 分</b></span>`).join('')}</div><div class="panel-buttons">${this.button('准备好了，开餐！','resume',true)}${this.button('返回菜单','menu')}</div></footer><small class="fine-print">准备时不计时 · 顾客表情表示耐心，及时送餐。</small></section>`,'briefing-overlay');
  }
  pause(): void { this.show(`<section class="panel compact"><span class="eyebrow">TAKE A LITTLE BREATHER</span><h2>厨房暂停营业</h2><p>炉灶、订单和计时都已暂停。</p><div class="stack-buttons">${this.button('继续开餐', 'resume', true)}${this.button('料理手册', 'recipes')}${this.button('声音设置', 'settings')}${this.button('重新开始本关', 'restart')}${this.button('返回主菜单', 'menu')}</div><small class="fine-print">P / Esc 也可以继续</small></section>`); }
  instructions(): void {
    this.show(`<section class="panel manual"><span class="eyebrow">A LITTLE GUIDE FOR BIG APPETITES</span><h2>你的第一天厨房班</h2><div class="instruction-grid"><div><h3>简单操作</h3><div class="instruction-keys">${keys}</div><p>一次携带一个物品。靠近设施会显示操作提示，金色边框表示当前目标。</p></div><div><h3>完整料理流程</h3><ol><li>在食材箱前按 J 拿取。</li><li>蔬菜放到切菜板，按住 Space；肉、米饭和面条放入炉灶。</li><li>把加工好的食材加进同一只干净盘子。</li><li>等客人入座点单，对照订单，在出餐口按 J。传送带会把料理送到对应客人面前。</li><li>吃完的脏盘会自动传送到洗碗槽，靠近后按住 Space 清洗；洗好的盘子自动放回盘架。</li></ol></div></div><div class="notice">拿着盘子对切菜板或熟食按 J 可以直接装盘；拿着食材对工作台上的盘子按 J 可以添加。错误食物拿到垃圾桶丢弃，盘子会保留。</div><div class="panel-buttons">${this.button('知道啦', 'menu', true)}${this.button('查看菜谱', 'recipes')}</div></section>`);
  }
  recipes(back: 'resume' | 'menu' = 'menu'): void {
    this.show(`<section class="panel recipe-book wide"><div class="panel-heading"><div><span class="eyebrow">THE LITTLE COOKBOOK</span><h2>六道拿手料理</h2><p>切好、煎熟、煮熟的食材才可以装盘。面包和奶酪可以直接使用。</p></div>${this.button(back === 'resume' ? '返回厨房' : '返回菜单', back)}</div><div class="recipe-grid">${RECIPES.map(r => `<article class="recipe-card"><img class="dish-picture" src="${this.orderIcons.get(r.id)}" alt="${r.name}"><div><small>${r.english}</small><h3>${r.name}</h3><p class="recipe-price">售价 ${recipeEconomy(r).price} 金币 · 原料成本 ${recipeEconomy(r).cost} 金币（50%）</p><div class="recipe-components">${r.components.map(part => `<span><img src="${iconData(part.kind, true)}" alt="">${INGREDIENTS[part.kind].name}<b>${part.state === 'RAW' ? '直接使用' : STATE_NAMES[part.state]}</b></span>`).join('')}</div>${r.id === 'soup' ? '<p class="recipe-note">番茄与洋葱先切好 → 同一锅煮 10 秒 → 装盘</p>' : `<p class="recipe-note">${r.components.map(p => p.state === 'COOKED' ? `${INGREDIENTS[p.kind].name}煮 / 煎 ${INGREDIENTS[p.kind].cook} 秒` : p.state === 'CHOPPED' ? `${INGREDIENTS[p.kind].name}切 ${INGREDIENTS[p.kind].chop} 秒` : '').filter(Boolean).join(' · ')}</p>`}</div></article>`).join('')}</div><section class="ingredient-prices"><h3>原材料单价 · 每份 / 金币</h3><div>${Object.entries(INGREDIENT_COST).map(([kind,cost])=>`<span><img src="${this.ingredientIcons.get(kind)}" alt="">${INGREDIENTS[kind as keyof typeof INGREDIENTS].name}<b>${cost}</b></span>`).join('')}</div><p>每道菜售价 = 原材料总成本 × 2。成功送到客人后计入营业额，损耗按同一单价结算。</p></section><div class="notice">土豆是练习食材，可切菜和丢弃，不属于这六道订单菜谱。锅内绿色状态可装盘，烧焦食物需要丢弃。</div></section>`);
    this.recipesOpen = true;
  }
  settings(back: 'resume' | 'menu' = this.hud.classList.contains('hidden') ? 'menu' : 'resume'): void {
    this.show(`<section class="panel compact"><span class="eyebrow">SOUNDS OF THE KITCHEN</span><h2>声音设置</h2><label class="volume-label">背景音乐<input class="volume-slider" id="music-volume" aria-label="背景音乐音量" type="range" min="0" max="1" step="0.05" value="${this.save.data.music}"></label><label class="volume-label">操作音效<input class="volume-slider" id="effects-volume" aria-label="操作音效音量" type="range" min="0" max="1" step="0.05" value="${this.save.data.effects}"></label><div class="panel-buttons">${this.button('切换静音', 'mute')}${this.button('完成', back, true)}</div><p class="fine-print">首次按键后启用声音。音量和静音会自动保存。</p></section>`);
  }
  results(result: RunResult): void {
    this.result = result;
    const level = LEVELS[result.level - 1], won = result.stars > 0, complete = result.level === 5 && won;
    this.show(`<section class="panel results"><header class="results-header"><div><span class="eyebrow">${complete ? 'YOU DID IT, CHEF!' : 'SERVICE COMPLETE'}</span><h2>${complete ? '五间厨房，圆满收工！' : won ? '干得漂亮，主厨！' : '再来一份，好吗？'}</h2><p>${level.name} · ${complete ? '单人料理冒险已完成' : '本次厨房成绩单'}</p></div><div class="result-stars">${[1,2,3].map(n=>`<span class="${result.stars>=n?'earned':''}" style="--delay:${n*.25}s">★</span>`).join('')}</div></header><div class="results-body"><section class="results-performance"><div class="result-score"><small>本次得分</small><strong>${result.score}</strong><span>个人最高 ${this.save.data.scores[result.level-1]}</span></div><div class="result-stats"><span>完成订单<b>${result.served}</b></span><span>客人离场<b>${result.failed}</b></span><span>最高连击<b>${result.bestCombo}</b></span></div><p class="result-tip">${won ? result.stars===3 ? '三星到手！每一份料理都值得认真对待。' : `下一颗星需要 ${level.stars[result.stars]} 分。边煮边切，会更有效率。` : `达到 ${level.stars[0]} 分获得一星。先熟悉路线，再挑战速度。`}</p></section><section class="results-finances"><div class="earnings-summary"><span>营业额 <b>${result.revenue}</b></span><span>原料总成本 <b>${result.ingredientCost}</b></span><span>净收益 <b>${result.profit}</b></span></div><p class="tips-summary">满意小费 +${result.tips ?? 0} 金币 · 耐心剩 2/3 以上上菜可得，不计入净收益</p>${badges(result)}<div class="waste-summary"><h3>食材损耗：${result.wasted} 份 · 成本 ${result.wasteCost} 金币</h3><p>包括丢弃、烧毁、送餐超时和收工未售食材。</p><div>${result.wasteBreakdown.map(w=>`<span><img src="${this.ingredientIcons.get(w.kind)}" alt="${INGREDIENTS[w.kind].name}">${INGREDIENTS[w.kind].name} ×${w.quantity}</span>`).join('') || '<span>本局没有浪费食材</span>'}</div></div></section></div><div class="stack-buttons">${won && result.level<5 ? this.button('下一间厨房 →','start',true,`data-level="${result.level+1}"`) : this.button('再挑战一次','restart',true)}${won && result.level<5 ? this.button('再挑战一次','restart') : ''}${this.button('选择关卡','levels')}${this.button('返回主菜单','menu')}</div></section>`,'results-overlay');
  }
  update(sim: Simulation, clock: number): void {
    if (clock - this.lastUpdate < 0.09) return; this.lastUpdate = clock;
    const orderKey = sim.orders.map(o => `${o.id}:${o.quantity}`).join(',');
    if (orderKey !== this.orderKey) {
      this.orderKey = orderKey;
      document.querySelector('#orders')!.innerHTML = sim.orders.map(o => {
        const r = recipe(o.recipeId);
        return `<article class="order-card" data-order="${o.id}" data-recipe="${r.id}" aria-label="${r.name}，还需 ${o.quantity} 份"><div class="order-heading"><img class="dish-icon" src="${this.orderIcons.get(r.id)}" alt="${r.name}"><b class="order-quantity" aria-label="还需 ${o.quantity} 份">×<span>${o.quantity}</span></b></div><div class="order-requirements">${r.components.map(part => `<div class="ingredient-symbol"><img src="${this.ingredientIcons.get(part.kind)}" alt="${INGREDIENTS[part.kind].name}"><div class="process-icons">${processSteps(r, part).map(processIcon).join('<span class="process-arrow" aria-hidden="true">›</span>')}</div></div>`).join('')}</div><div class="order-patience" role="progressbar" aria-label="${r.name}：等待最久顾客的剩余耐心" aria-valuemin="0" aria-valuemax="${PATIENCE_SECONDS}" aria-valuenow="${PATIENCE_SECONDS}"><i></i></div></article>`;
      }).join('') || '<p class="dining-hint">客人入座点单后，订单会出现在这里</p>';
    }
    for (const order of sim.orders) {
      const el = document.querySelector<HTMLElement>(`[data-order="${order.id}"]`)!;
      const ratio = Math.max(0, Math.min(1, order.remaining / order.duration));
      const bar=el.querySelector<HTMLElement>('.order-patience')!;
      bar.setAttribute('aria-valuenow',String(Math.ceil(Math.max(0,order.remaining))));
      bar.setAttribute('aria-valuetext',`剩余 ${Math.ceil(Math.max(0,order.remaining))} 秒`);
      bar.dataset.mood=ratio>2/3?'relaxed':ratio>1/3?'uneasy':'angry';
      bar.querySelector<HTMLElement>('i')!.style.width=`${ratio*100}%`;
      el.classList.toggle('urgent', ratio < 0.25);

    }
    document.querySelector('#score')!.textContent = String(sim.score);
    document.querySelector('#combo')!.textContent = sim.combo ? `连击 ×${sim.combo} · 奖励 +${Math.min(50, (sim.combo - 1) * 10)}` : '下一份料理，认真做好';
    const seconds = Math.ceil(sim.time);
    document.querySelector('#timer')!.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    document.querySelector('.timer-panel')!.classList.toggle('urgent', seconds <= 30);
    (document.querySelector('#time-bar') as HTMLElement).style.width = `${sim.time / ROUND_SECONDS * 100}%`;
    document.querySelector('#targets')!.innerHTML = sim.level.stars.map(v => `<span class="${sim.score >= v ? 'earned' : ''}">★ <b>${v}</b></span>`).join('');
    const target = sim.target;
    const prompt = document.querySelector('#interaction')!;
    if (target?.kind === 'crate' && target.ingredient) {
      prompt.innerHTML = `<img class="prompt-icon" src="${this.ingredientIcons.get(target.ingredient)}" alt="${INGREDIENTS[target.ingredient].name}"><span>${sim.prompt().replace(INGREDIENTS[target.ingredient].name, '')}</span>`;
    } else prompt.textContent = sim.prompt();
    const held = sim.player.held;
    const heldKey = JSON.stringify(held);
    if (heldKey !== this.heldKey) {
      this.heldKey = heldKey;
      const text = !held ? '双手空闲' : held.type === 'extinguisher' ? 'Space 灭火' : held.type === 'plate' ? held.dirty ? '放入水槽清洗' : matchRecipe(held.components) ? '可以上菜' : held.components.length ? '继续组合' : '可以装盘' : STATE_NAMES[held.components[0].state];
      document.querySelector('#held')!.innerHTML = `${held ? `<img class="held-icon" src="${itemData(held)}" alt="${held.type === 'food' ? held.components.map(p => INGREDIENTS[p.kind].name).join('、') : held.type === 'plate' ? '盘子' : '灭火器'}">` : ''}<span>${text}</span>`;
    }
    document.querySelector('#dash')!.textContent = sim.player.cooldown > 0 ? `冲刺 ${sim.player.cooldown.toFixed(1)}s` : 'K · 冲刺就绪';
  }
  toast(text: string): void { const element = document.querySelector('#toast')!; element.textContent = text; element.classList.add('visible'); window.clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => element.classList.remove('visible'), 2700); }
  updateMute(): void { document.querySelectorAll('#mute,[data-home-mute]').forEach(button=>button.textContent=this.save.data.muted?'已静音':'音乐开'); }
}

function badges(result: RunResult): string {
  const earned = earnedAchievements(result);
  const stats = `<p class="badge-note">完美火候 ${result.perfects ?? 0} 次 · 投掷食材 ${result.throws ?? 0} 次 · 最高连击 ${result.bestCombo}</p>`;
  if (!earned.length) return `${stats}<p class="badge-note">本局成就 0/${ACHIEVEMENT_COUNT} · 试试连击、完美火候或投掷食材</p>`;
  return `${stats}<div class="badges" aria-label="本局成就">${earned.map(a => `<span class="badge" title="${a.hint}"><b>${a.icon}</b>${a.name}</span>`).join('')}</div>`;
}
