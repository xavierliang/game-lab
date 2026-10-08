(async () => {
  try {
    const res = await fetch('./games.json');
    if (!res.ok) throw new Error('unavailable');
    const data = await res.json();
    document.title = data.title + ' · 小游戏集合';
    const params = new URLSearchParams(location.search);
    for (const game of data.games) {
      const el = document.createElement('article'),
        tag = document.createElement('small'),
        title = document.createElement('h2'),
        desc = document.createElement('p'),
        link = document.createElement('a');
      tag.textContent =
        game.status === 'example' ? 'INTEGRATION EXAMPLE · 接入示例' : 'BROWSER GAME · 浏览器游玩';
      title.textContent = game.title.zh;
      desc.textContent = game.description.zh;
      const url = new URL('./' + game.slug + '/', location.href);
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref']) {
        const value = params.get(key);
        if (value && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(value))
          url.searchParams.set(key, value);
      }
      link.href = url.href;
      link.textContent = '开始游玩 ↗';
      el.append(tag, title, desc, link);
      document.getElementById('games').append(el);
    }
  } catch {
    document.getElementById('status').textContent = '游戏列表暂时无法加载，请稍后刷新。';
  }
})();
