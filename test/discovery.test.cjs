const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseDesktop } = require('../desktop/discovery.cjs');
test('desktop parser keeps French name and game category', () => {
  const entry = parseDesktop('[Desktop Entry]\nType=Application\nName=Chess\nName[fr]=Échecs\nCategories=BoardGame;Game;\nExec=chess %U\nComment=Board game\n[Desktop Action New]\nName=New');
  assert.equal(entry.name, 'Échecs'); assert.equal(entry.type, 'game');
  assert.equal(entry.desktopCategories, 'BoardGame;Game;'); assert.equal(entry.executable, 'chess %U'); assert.equal(entry.description, 'Board game');
});
test('desktop parser ignores hidden and non-application entries', () => {
  for (const entry of ['Type=Link\nName=Link', 'Type=Application\nHidden=true\nName=Hidden', 'Type=Application\nNoDisplay=true\nName=Service']) assert.equal(parseDesktop('[Desktop Entry]\n'+entry),null);
});
