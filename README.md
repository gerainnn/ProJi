# ProJi — Clicker × Roguelike

Mobile-first веб-игра. Кликаешь монстра → выбиваешь шмот → идёшь в 2D top-down рейд → возвращаешься с осколками → качаешь кликер → по кругу.

## Стек

- TypeScript + Vite
- Phaser 3 (один движок и для кликера, и для рогалика)
- LocalStorage save (v1)
- Процедурный SFX через WebAudio (без аудио-файлов)
- Все спрайты сгенерированы из примитивов в рантайме

## Запуск локально

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc + vite build
```

## Структура

```
src/
  core/        # store, save, eventBus, rng, sfx
  data/        # items, monsters, enemies, upgrades
  raid/        # Joystick, Player, Enemy, Projectile (gameplay primitives)
  scenes/      # BootScene, ClickerScene, InventoryScene, UpgradeScene, RaidScene, ResultScene, HudScene
  ui/          # theme, widgets (button, toast, floating numbers, screen shake)
  main.ts      # Phaser config + scene registration
```

## Геймплей

**Кликер.** Тапаешь монстра — наносишь урон, считающийся из надетого оружия + апгрейдов. С шансом критуешь, с шансом выпадает лут (5 редкостей: common → legendary). Каждое убийство повышает уровень монстра.

**Сумка.** 3 слота: оружие/броня/талисман. Лучший по power автоматически надевается. Можно продавать за золото.

**Прокачка.** 8 пермачей: урон тапа, золото, шанс крита, сила крита, двойной дроп, автоклик, урон в рейде, HP в рейде. Покупаются за ✦ осколки из рейдов.

**Рейд.** 5 комнат, последняя — босс. Виртуальный джойстик слева, авто-атака по ближайшему врагу. Меч → ближний бой по дуге. Лук/посох → снаряды. Враги: слизни, гоблины, лучники, громилы, босс. После рейда — золото + осколки + лут. При смерти — половина наград.

## Деплой

Workflow `.github/workflows/deploy.yml` собирает и публикует на GitHub Pages при пуше в `main`. После первого успешного запуска включи Pages в Settings → Pages → Source: GitHub Actions.

Доступно по адресу: `https://<user>.github.io/<repo>/`
