(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const list = $('#participant-list');
  const initialPeople = [
    { name: '민준', amount: 12500 },
    { name: '서연', amount: 9800 },
    { name: '지호', amount: 14500 },
  ];
  let people = initialPeople.map((person, i) => ({ ...person, id: i + 1 }));
  let nextId = 4;
  let mode = 'equal';
  let calculationMode = 'items';
  let copiedTimer;
  let lastMessage = '';

  const won = value => `${Math.round(value).toLocaleString('ko-KR')}원`;
  const numberFrom = value => {
    const digits = String(value ?? '').replace(/[^\d]/g, '');
    return digits ? Math.min(Number(digits), 9999999) : 0;
  };
  const distribute = (total, weights) => {
    if (!weights.length || !total) return weights.map(() => 0);
    const sum = weights.reduce((a, b) => a + b, 0);
    if (!sum) return weights.map(() => 0);
    const exact = weights.map(weight => total * weight / sum);
    const shares = exact.map(Math.floor);
    let remainder = total - shares.reduce((a, b) => a + b, 0);
    exact.map((value, index) => ({ index, fraction: value - shares[index] }))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
      .slice(0, remainder).forEach(({ index }) => shares[index]++);
    return shares;
  };
  const distributeCapped = (total, weights, capacities) => {
    const shares = weights.map(() => 0);
    let remaining = Math.min(total, capacities.reduce((sum, amount) => sum + amount, 0));
    let active = weights.map((_, index) => index).filter(index => capacities[index] > 0);
    while (remaining > 0 && active.length) {
      const proposed = distribute(remaining, active.map(index => weights[index]));
      let assigned = 0;
      active.forEach((index, offset) => {
        const amount = Math.min(proposed[offset], capacities[index] - shares[index]);
        shares[index] += amount;
        assigned += amount;
      });
      if (assigned === 0) {
        const index = active[0];
        shares[index]++;
        assigned = 1;
      }
      remaining -= assigned;
      active = active.filter(index => shares[index] < capacities[index]);
    }
    return shares;
  };

  function renderPeople() {
    list.innerHTML = '';
    people.forEach((person, index) => {
      const card = document.createElement('div');
      card.className = 'person-card';
      card.innerHTML = `<div class="person-top"><span class="person-number">${String(index + 1).padStart(2, '0')}</span><input class="person-name" type="text" maxlength="10" value="${escapeAttr(person.name)}" aria-label="참여자 ${index + 1} 이름" placeholder="이름 또는 별명" /><label class="amount-wrap"><input class="amount-input" type="text" inputmode="numeric" value="${person.amount ? person.amount.toLocaleString('ko-KR') : ''}" aria-label="${escapeAttr(person.name)} 메뉴 금액" placeholder="메뉴 금액" /><span>원</span></label><button class="remove-person" type="button" aria-label="${escapeAttr(person.name)} 삭제" title="참여자 삭제">×</button></div><div class="person-subtotal">메뉴 합계 <strong>${won(person.amount)}</strong></div>`;
      const nameInput = $('.person-name', card);
      const amountInput = $('.amount-input', card);
      nameInput.addEventListener('input', () => {
        person.name = nameInput.value;
        amountInput.setAttribute('aria-label', `${person.name || `참여자 ${index + 1}`} 메뉴 금액`);
        $('.remove-person', card).setAttribute('aria-label', `${person.name || `참여자 ${index + 1}`} 삭제`);
        refresh();
      });
      amountInput.addEventListener('input', () => {
        person.amount = numberFrom(amountInput.value);
        amountInput.value = person.amount ? person.amount.toLocaleString('ko-KR') : '';
        $('.person-subtotal strong', card).textContent = won(person.amount);
        refresh();
      });
      amountInput.addEventListener('blur', () => { amountInput.value = person.amount ? person.amount.toLocaleString('ko-KR') : ''; });
      $('.remove-person', card).addEventListener('click', () => {
        if (people.length <= 1) return;
        people = people.filter(item => item.id !== person.id);
        renderPeople();
        refresh();
      });
      list.append(card);
    });
    $('#people-count').textContent = `${people.length}명`;
  }
  function escapeAttr(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }

  function getState() {
    const fee = calculationMode === 'items' ? numberFrom($('#delivery-fee').value) : 0;
    const discountInput = calculationMode === 'items' ? numberFrom($('#discount').value) : 0;
    const sharedAmount = calculationMode === 'total' ? numberFrom($('#shared-amount').value) : 0;
    const menuTotal = calculationMode === 'items' ? people.reduce((sum, person) => sum + person.amount, 0) : 0;
    const invalidNames = people.some(person => !person.name.trim() || person.name.trim().length > 10);
    const zeroPeople = calculationMode === 'items' ? people.filter(person => person.amount <= 0) : [];
    const valid = people.length >= 2 && !invalidNames && (calculationMode === 'total' ? sharedAmount > 0 : zeroPeople.length === 0 && !(mode === 'proportional' && menuTotal === 0));
    const weights = mode === 'equal' ? people.map(() => 1) : people.map(person => person.amount);
    const feeShares = calculationMode === 'items' ? distribute(fee, weights) : people.map(() => 0);
    const sharedShares = calculationMode === 'total' ? distribute(sharedAmount, people.map(() => 1)) : people.map(() => 0);
    const appliedDiscount = Math.min(discountInput, menuTotal + fee);
    const gross = people.map((person, i) => calculationMode === 'total' ? sharedShares[i] : person.amount + feeShares[i]);
    const discountShares = distributeCapped(appliedDiscount, weights, gross);
    const amounts = gross.map((amount, i) => Math.max(0, amount - discountShares[i]));
    const grand = amounts.reduce((sum, amount) => sum + amount, 0);
    return { fee, sharedAmount, sharedShares, discountInput, appliedDiscount, menuTotal, feeShares, discountShares, amounts, grand, valid, invalidNames, zeroPeople };
  }

  function validationMessage(state) {
    if (people.length < 2) return '참여자를 2명 이상 추가해 주세요.';
    if (state.invalidNames) return '이름은 공백만 입력할 수 없으며 1~10자로 적어주세요.';
    if (calculationMode === 'total' && state.sharedAmount <= 0) return '나눌 전체 금액을 입력해 주세요.';
    if (state.zeroPeople.length) return '메뉴 금액이 0원인 참여자가 있습니다. 금액을 확인하거나 참여자를 삭제해 주세요.';
    if (mode === 'proportional' && state.menuTotal === 0) return '메뉴 금액 합계가 0원일 때는 비례 분할을 사용할 수 없습니다. 균등 분할을 선택하거나 메뉴 금액을 입력해 주세요.';
    return '';
  }

  function createMessage(state) {
    const resultLines = people.map((person, i) => {
      const details = calculationMode === 'total'
        ? [`전체 금액 N등분 ${won(state.amounts[i])}`]
        : [`메뉴 ${won(person.amount)}`, `배달비 ${won(state.feeShares[i])}`, `할인 -${won(state.discountShares[i])}`];
      return `· ${person.name.trim()}: ${won(state.amounts[i])}  (${details.join(' · ')})`;
    });
    const bankName = $('#bank-name').value.trim();
    const account = $('#account-number').value.trim();
    const owner = $('#account-owner').value.trim();
    const accountParts = [bankName, account, owner ? `${owner} 예금주` : ''].filter(Boolean);
    const summary = calculationMode === 'total'
      ? `전체 금액 ${won(state.sharedAmount)} ÷ ${people.length}명`
      : `메뉴 ${won(state.menuTotal)} + 배달비 ${won(state.fee)} - 할인 ${won(state.appliedDiscount)}`;
    const lines = ['🍽️ 배달 정산 내역', '', ...resultLines, '', summary, `총 결제 금액 ${won(state.grand)}`];
    if (state.discountInput > state.appliedDiscount) lines.push(`※ 할인은 결제 금액 한도 내에서 ${won(state.appliedDiscount)} 적용했어요.`);
    if (accountParts.length) lines.push('', `💳 송금 계좌: ${accountParts.join(' ')}`);
    lines.push('', '확인 후 입금 부탁해요!');
    return lines.join('\n').slice(0, 1000);
  }

  function refresh() {
    const state = getState();
    const totalMode = calculationMode === 'total';
    $('.participant-list').classList.toggle('total-mode', totalMode);
    $('.participants-panel').classList.toggle('total-mode', totalMode);
    $('#participant-step').textContent = totalMode ? '참여자' : '주문 내역';
    $('#participants-title').textContent = totalMode ? '누가 나눠 내나요?' : '누가 같이 먹나요?';
    $('#participants-description').textContent = totalMode ? '이름만 입력하면 돼요. 메뉴 내역은 필요 없어요.' : '이름과 각자 메뉴 금액을 적어주세요.';
    $('#total-mode-panel').hidden = !totalMode;
    $('.costs-panel').hidden = totalMode;
    $('#food-total').textContent = won(state.menuTotal);
    const notice = $('#validation-notice');
    notice.textContent = validationMessage(state);
    notice.hidden = !notice.textContent;
    const splitNotice = $('#split-notice');
    splitNotice.textContent = state.discountInput > state.appliedDiscount ? `할인 ${won(state.discountInput - state.appliedDiscount)}은 결제 금액을 초과해 적용되지 않아요.` : '';
    splitNotice.hidden = !splitNotice.textContent;
    const resultList = $('#result-list');
    resultList.innerHTML = '';
    people.forEach((person, index) => {
      const row = document.createElement('div');
      row.className = 'result-row';
      const label = person.name.trim() || `참여자 ${index + 1}`;
      const details = totalMode ? `전체 금액 N등분 · ${won(state.amounts[index])}` : `메뉴 ${won(person.amount)} · 추가 ${won(state.feeShares[index] - state.discountShares[index])}`;
      row.innerHTML = `<div class="result-person"><span class="avatar">${escapeAttr(label.slice(0, 1))}</span><div>${escapeAttr(label)}<div class="result-details">${details}</div></div></div><strong class="result-amount">${won(state.amounts[index])}</strong>`;
      resultList.append(row);
    });
    $('#grand-total').textContent = won(state.grand);
    $('#total-breakdown').textContent = totalMode
      ? `전체 금액 ${won(state.sharedAmount)} · ${people.length}명 균등 분할`
      : `메뉴 ${won(state.menuTotal)} · 배달비 ${won(state.fee)} · 할인 ${won(state.appliedDiscount)}`;
    const nextMessage = createMessage(state);
    const preview = $('#message-preview');
    if (preview.value === '' || preview.value === lastMessage) preview.value = nextMessage;
    lastMessage = nextMessage;
    $('#copy-button').disabled = !state.valid;
    $('#copy-button').style.opacity = state.valid ? '1' : '.55';
  }

  $('#add-person').addEventListener('click', () => {
    if (people.length >= 20) return;
    people.push({ id: nextId++, name: '', amount: 0 });
    renderPeople();
    refresh();
    $('.person-name', list.lastElementChild).focus();
  });
  $$('.calculation-option').forEach(button => button.addEventListener('click', () => {
    calculationMode = button.dataset.calculation;
    $$('.calculation-option').forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    refresh();
  }));
  $$('.segment').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    $$('.segment').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
    refresh();
  }));
  ['delivery-fee', 'discount', 'shared-amount'].forEach(id => {
    const input = $(`#${id}`);
    input.addEventListener('input', () => { input.value = numberFrom(input.value).toLocaleString('ko-KR'); refresh(); });
  });
  ['bank-name', 'account-owner', 'account-number'].forEach(id => $(`#${id}`).addEventListener('input', refresh));

  $('#copy-button').addEventListener('click', async () => {
    const error = $('#copy-error');
    error.hidden = true;
    const account = $('#account-number').value.trim();
    if (account && !/^[\d-]{1,30}$/.test(account)) {
      error.textContent = '계좌번호는 숫자와 하이픈(-)으로 1~30자 이내로 입력해 주세요.';
      error.hidden = false;
      $('#account-number').focus();
      return;
    }
    if ($('#bank-name').value.trim().length > 15 || $('#account-owner').value.trim().length > 15) {
      error.textContent = '은행명과 예금주는 각각 15자 이내로 입력해 주세요.';
      error.hidden = false;
      return;
    }
    const text = $('#message-preview').value;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        $('#message-preview').focus();
        $('#message-preview').select();
        if (!document.execCommand('copy')) throw new Error('copy failed');
      }
      const button = $('#copy-button');
      button.classList.add('success');
      $('.copy-icon', button).textContent = '✓';
      $('span:nth-child(2)', button).textContent = '복사 완료! 카톡에 붙여넣기';
      $('#toast').classList.add('show');
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        button.classList.remove('success');
        $('.copy-icon', button).textContent = '▢';
        $('span:nth-child(2)', button).textContent = '정산 메시지 복사하기';
        $('#toast').classList.remove('show');
      }, 2400);
    } catch {
      error.textContent = '복사에 실패했습니다. 메시지 영역을 길게 눌러 직접 복사해 주세요.';
      error.hidden = false;
    }
  });

  renderPeople();
  refresh();
})();
