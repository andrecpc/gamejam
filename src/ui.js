// UI binding for cards, HUD, and upgrade modal

export function setupUI(state, { onCardClick, onRestart, onPickUpgrade }) {
  const el = {
    lightBtn: document.getElementById('card-light'),
    darkBtn: document.getElementById('card-dark'),
    neutralBtn: document.getElementById('card-neutral'),
    barLight: document.getElementById('bar-light'),
    barDark: document.getElementById('bar-dark'),
    barNeutral: document.getElementById('bar-neutral'),
    barLightText: document.getElementById('bar-light-text'),
    barDarkText: document.getElementById('bar-dark-text'),
    barNeutralText: document.getElementById('bar-neutral-text'),
    hp: document.getElementById('stat-hp'),
    armor: document.getElementById('stat-armor'),
    atk: document.getElementById('stat-atk'),
    wave: document.getElementById('stat-wave'),
    restart: document.getElementById('btn-restart'),
    modal: document.getElementById('upgrade-modal'),
    modalList: document.getElementById('upgrade-options'),
    modalCancel: document.getElementById('upgrade-cancel'),
  };

  el.lightBtn.addEventListener('click', ()=> onCardClick('light'));
  el.darkBtn.addEventListener('click', ()=> onCardClick('dark'));
  el.neutralBtn.addEventListener('click', ()=> onCardClick('neutral'));
  el.restart.addEventListener('click', onRestart);
  el.modalCancel.addEventListener('click', ()=> hideUpgradeModal());

  function updateCards(){
    const cs = state.cards;
    const upd = (type, bar, text, btn) => {
      const cur = cs[type].cur, cap = cs[type].cap;
      bar.style.width = `${Math.round((cur/cap)*100)}%`;
      text.textContent = `${cur} / ${cap}`;
      btn.disabled = !(cur>=cap);
    };
    upd('light', el.barLight, el.barLightText, el.lightBtn);
    upd('dark', el.barDark, el.barDarkText, el.darkBtn);
    upd('neutral', el.barNeutral, el.barNeutralText, el.neutralBtn);
  }

  function updateHUD(){
    el.hp.textContent = `HP: ${state.hero.hp}/${state.hero.maxHp}`;
    el.armor.textContent = `Броня: ${state.hero.def}`;
    el.atk.textContent = `Урон: ${state.hero.atk}`;
    el.wave.textContent = `Волна: ${state.wave}`;
  }

  function showUpgradeModal(options){
    el.modalList.innerHTML = '';
    for (const opt of options){
      const div = document.createElement('button');
      div.className = `upgrade-option ${opt.rarity}`;
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = opt.text || opt.id;
      const sub = document.createElement('div');
      sub.className = 'desc';
      sub.textContent = `Редкость: ${opt.rarity}`;
      div.appendChild(title); div.appendChild(sub);
      div.addEventListener('click', ()=> { hideUpgradeModal(); onPickUpgrade(opt); });
      el.modalList.appendChild(div);
    }
    el.modal.classList.remove('hidden');
  }

  function hideUpgradeModal(){ el.modal.classList.add('hidden'); }

  return { updateCards, updateHUD, showUpgradeModal, hideUpgradeModal };
}

