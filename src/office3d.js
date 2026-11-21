// 3D-кабинет детектива для режима «показания» (proto3d.html). Three.js — из vendor/three.js (importmap «three»).
//
// Рамка вокруг 2D-игры, а не замена ей:
//   — открыли дело: вид от первого лица — стоим у стола, садимся; камера опускается к бумагам,
//     и сцена сменяется 2D-игрой (proto.js);
//   — дело закрыто: снова кабинет, ставим на протокол штамп «Раскрыто» или «Не раскрыто»;
//   — кнопка «за стол» — снова вид от первого лица, нажатие на бумаги — снова к делу.
// Бумаги на столе — те же листы, что на экране (paint.js рисует их с 2D): размер, наклон и место
// на столе берём с экрана, а камеру над бумагами ставим так, чтобы лист лёг ровно туда, где он в 2D, —
// переход «наклонился над делом» совпадает до линии, лампа к этому моменту уже за кадром.
// Свет — тёплый конус лампы с тенями и отражения окружения; дерево, сукно рисуем на холсте сами.
// Рисуем только во время движения; в 2D кабинет не рисуется вовсе.

import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Raycaster,
  RepeatWrapping,
  RoomEnvironment,
  Scene,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { drawStamp, paperFill } from './paint.js';

const DESK_Y = 0.75; // высота столешницы, м
const PROTOCOL_W = 0.21; // ширина протокола на столе, м — как лист A4; остальное — в том же масштабе
const PAPERS_TOP = -0.2; // где на столе верхний край протокола (z)
const LIFT = 0.0012; // листы лежат стопкой: каждый следующий чуть выше

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/* ---------- текстуры: дерево и сукно — рисуем на холсте ---------- */

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function woodTexture() {
  const [c, ctx] = canvas(1024, 512);
  ctx.fillStyle = '#3e2416';
  ctx.fillRect(0, 0, 1024, 512);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // волокна — длинные волнистые полосы разной темноты
  for (let i = 0; i < 300; i++) {
    const y = rnd() * 512;
    const dark = rnd() < 0.55;
    ctx.strokeStyle = dark ? `rgba(22,11,5,${0.1 + rnd() * 0.3})` : `rgba(122,74,40,${0.06 + rnd() * 0.16})`;
    ctx.lineWidth = 0.6 + rnd() * 2.6;
    const f = 60 + rnd() * 60;
    const a = 1.5 + rnd() * 4;
    ctx.beginPath();
    for (let x = 0; x <= 1024; x += 12) ctx.lineTo(x, y + Math.sin(x / f + i) * a);
    ctx.stroke();
  }
  return c;
}

// Сукно — тот же тёмно-зелёный, что у стола в 2D (var(--baize)), с ворсом.
function feltTexture() {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#1a2822';
  ctx.fillRect(0, 0, 512, 512);
  const img = ctx.getImageData(0, 0, 512, 512);
  let s = 11;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 16807) % 2147483647;
    const d = (s / 2147483647 - 0.5) * 26;
    img.data[i] += d * 0.8;
    img.data[i + 1] += d;
    img.data[i + 2] += d * 0.85;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Папка дела: картон, номер дела.
function folderTexture(title) {
  const [c, ctx] = canvas(900, 640);
  paperFill(ctx, 900, 640, '#b99a63', 3);
  ctx.strokeStyle = 'rgba(80,52,20,0.45)';
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, 828, 568);
  ctx.fillStyle = 'rgba(52,32,12,0.88)';
  ctx.font = '700 30px "PT Sans Narrow", sans-serif';
  ctx.fillText('УГОЛОВНЫЙ РОЗЫСК', 80, 110);
  ctx.font = '700 72px "PT Serif", Georgia, serif';
  ctx.fillText(title, 80, 210);
  ctx.strokeStyle = 'rgba(52,32,12,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(80, 300 + i * 70);
    ctx.lineTo(820, 300 + i * 70);
    ctx.stroke();
  }
  return c;
}

/* ---------- сцена ---------- */

export function createOffice(host, { title, reducedMotion = false } = {}) {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  // нейтральная тональная кривая: бумага остаётся того же цвета, что в 2D, — переход незаметен
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.className = 'office-canvas';
  host.append(renderer.domElement);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new Scene();
  scene.background = new Color(0x060708);
  scene.fog = new Fog(0x060708, 2.4, 6);
  // отражения окружения: латунь лампы и лак стола не выглядят пластиком
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.12;
  pmrem.dispose();

  const camera = new PerspectiveCamera(46, 1, 0.02, 20);

  const tex = (c, repeat = 0) => {
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = maxAniso;
    if (repeat) {
      t.wrapS = RepeatWrapping;
      t.wrapT = RepeatWrapping;
      t.repeat.set(repeat, repeat);
    }
    return t;
  };
  const shadow = (m, cast = true, receive = true) => {
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
  };

  /* стол: тёмный орех под лаком, вставка сукна — как поле стола в 2D */
  const woodMap = tex(woodTexture());
  const wood = new MeshPhysicalMaterial({ map: woodMap, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.35 });
  const desk = shadow(new Mesh(new BoxGeometry(1.7, 0.05, 0.92), wood), false, true);
  desk.position.set(0, DESK_Y - 0.025, 0);
  const felt = shadow(new Mesh(new PlaneGeometry(1.3, 0.7), new MeshStandardMaterial({ map: tex(feltTexture(), 3), roughness: 1 })), false, true);
  felt.rotation.x = -Math.PI / 2;
  felt.position.set(0, DESK_Y + 0.0005, 0);
  const front = new Mesh(new BoxGeometry(1.64, 0.62, 0.02), new MeshStandardMaterial({ map: woodMap, color: 0x8a6a55, roughness: 0.6 }));
  front.position.set(0, DESK_Y - 0.36, 0.4);
  scene.add(desk, felt, front);
  // пол, стена с панелями — почти во тьме: свет есть только у лампы
  const floor = new Mesh(new PlaneGeometry(10, 10), new MeshStandardMaterial({ color: 0x15100c, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  const wall = new Mesh(new PlaneGeometry(10, 4), new MeshStandardMaterial({ color: 0x1d211e, roughness: 1 }));
  wall.position.set(0, 2, -1.1);
  const panel = new Mesh(new BoxGeometry(10, 0.95, 0.03), new MeshStandardMaterial({ map: woodMap, color: 0x6d5444, roughness: 0.55 }));
  panel.position.set(0, 0.475, -1.085);
  scene.add(floor, wall, panel);

  /* бумаги: протокол (и лист под ним), показания, папка — размеры и места даёт layout() */
  const sheet = (name) => {
    const m = shadow(new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial({ roughness: 0.9, side: DoubleSide })), true, true);
    m.rotation.x = -Math.PI / 2;
    m.name = name;
    m.visible = false;
    scene.add(m);
    return m;
  };
  const under = sheet('under'); // край ещё одного листа под протоколом, как в 2D
  under.material.color.set(0xcfd0c5);
  const statements = sheet('statements');
  const protocol = sheet('protocol');
  const folder = shadow(new Mesh(new PlaneGeometry(0.33, 0.235), new MeshStandardMaterial({ map: tex(folderTexture(title)), roughness: 0.85 })), true, true);
  folder.rotation.set(-Math.PI / 2, 0, 0.12);
  scene.add(folder);
  const papers = [protocol, statements];

  /* банковская лампа: латунное основание, зелёный стеклянный абажур, тёплый конус света */
  const brass = new MeshStandardMaterial({ color: 0xb48c48, metalness: 1, roughness: 0.3 });
  const lamp = new Group();
  const base = shadow(
    new Mesh(new LatheGeometry([new Vector2(0, 0), new Vector2(0.08, 0), new Vector2(0.085, 0.008), new Vector2(0.065, 0.022), new Vector2(0.018, 0.034), new Vector2(0, 0.034)], 48), brass),
  );
  const stem = shadow(new Mesh(new CylinderGeometry(0.009, 0.009, 0.3, 16), brass));
  stem.position.y = 0.18;
  const yoke = shadow(new Mesh(new TorusGeometry(0.05, 0.006, 8, 24, Math.PI), brass));
  yoke.position.y = 0.33;
  // абажур: полуцилиндр выпуклостью вверх, снаружи зелёное стекло, внутри молочное — светится
  const shadeGeo = new CylinderGeometry(0.065, 0.065, 0.32, 40, 1, true, 0, Math.PI);
  const glass = new MeshPhysicalMaterial({ color: 0x0b5a2c, roughness: 0.12, metalness: 0, clearcoat: 1, emissive: 0x031a0c });
  const shade = new Mesh(shadeGeo, glass); // тень от абажура не нужна: свет — под ним
  const inner = new Mesh(shadeGeo, new MeshBasicMaterial({ color: 0xf2c27a, side: BackSide }));
  const capGeo = new CylinderGeometry(0.066, 0.066, 0.006, 40, 1, false, 0, Math.PI);
  const capA = new Mesh(capGeo, brass);
  capA.position.y = 0.16;
  const capB = capA.clone();
  capB.position.y = -0.16;
  const head = new Group();
  head.add(shade, inner, capA, capB);
  head.rotation.z = Math.PI / 2;
  head.position.y = 0.37;
  const bulbGlow = new Mesh(new CapsuleGeometry(0.014, 0.2, 4, 12), new MeshBasicMaterial({ color: 0xfff1d0 }));
  bulbGlow.rotation.z = Math.PI / 2;
  bulbGlow.position.set(0, 0.36, 0);
  const chain = new Mesh(new CylinderGeometry(0.0012, 0.0012, 0.09, 6), brass);
  chain.position.set(0.12, 0.3, 0.05);
  const knob = new Mesh(new SphereGeometry(0.006, 10, 8), brass);
  knob.position.set(0.12, 0.255, 0.05);
  lamp.add(base, stem, yoke, head, bulbGlow, chain, knob);
  scene.add(lamp);
  const lampLight = new SpotLight(0xffd6a0, 16, 2.6, 1.15, 1, 1.3);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(2048, 2048);
  lampLight.shadow.bias = -0.0004;
  lampLight.shadow.normalBias = 0.002;
  lampLight.shadow.radius = 3;
  lampLight.shadow.camera.near = 0.05;
  scene.add(lampLight, lampLight.target);
  const bulb = new PointLight(0xffc98a, 0.15, 0.7, 2);
  scene.add(bulb);
  // луна из окна за спиной — холодный еле заметный свет, чтобы тени не были чёрными провалами
  const moon = new DirectionalLight(0x7d8cc0, 0.45);
  moon.position.set(1.6, 2.6, 1.6);
  scene.add(moon, new AmbientLight(0x2a2f38, 0.5));

  /* мелочи: штемпельная подушка и штамп, чашка, перо, лупа */
  const dark = new MeshStandardMaterial({ color: 0x1a1612, roughness: 0.5, metalness: 0.3 });
  const pad = shadow(new Mesh(new BoxGeometry(0.11, 0.014, 0.075), dark));
  const padInk = new Mesh(new PlaneGeometry(0.094, 0.06), new MeshStandardMaterial({ color: 0x4a1210, roughness: 0.35 }));
  padInk.rotation.x = -Math.PI / 2;
  const stamp = new Group();
  const stampBase = shadow(new Mesh(new BoxGeometry(0.085, 0.018, 0.045), new MeshStandardMaterial({ color: 0x3a2415, roughness: 0.5 })));
  stampBase.position.y = 0.013;
  const rubber = new Mesh(new BoxGeometry(0.08, 0.004, 0.04), new MeshStandardMaterial({ color: 0x5a1612, roughness: 0.7 }));
  rubber.position.y = 0.002;
  const handle = shadow(new Mesh(new CylinderGeometry(0.011, 0.016, 0.07, 20), new MeshStandardMaterial({ color: 0x5c3820, roughness: 0.4 })));
  handle.position.y = 0.057;
  const ball = shadow(new Mesh(new SphereGeometry(0.021, 20, 14), new MeshStandardMaterial({ color: 0x5c3820, roughness: 0.35 })));
  ball.position.y = 0.097;
  stamp.add(stampBase, rubber, handle, ball);
  // рука со штампом: рукав пальто, манжета и кулак — видны, только пока штамп в руке
  const arm = new Group();
  const fist = shadow(new Mesh(new SphereGeometry(0.03, 20, 14), new MeshStandardMaterial({ color: 0xb98a6a, roughness: 0.65 })));
  fist.scale.set(1.15, 0.95, 1.35);
  fist.position.set(0, 0.105, 0.006);
  const cuff = shadow(new Mesh(new CylinderGeometry(0.036, 0.04, 0.05, 20), new MeshStandardMaterial({ color: 0xd9d6cc, roughness: 0.8 })));
  const sleeve = shadow(new Mesh(new CylinderGeometry(0.046, 0.055, 0.5, 20), new MeshStandardMaterial({ color: 0x2a2724, roughness: 0.9 })));
  const forearm = new Group();
  cuff.position.y = 0.035;
  sleeve.position.y = 0.3;
  forearm.add(cuff, sleeve);
  forearm.position.set(0, 0.11, 0.02);
  forearm.rotation.set(-1.0, 0, -0.7); // рука идёт к камере и вправо
  arm.add(fist, forearm);
  arm.visible = false;
  stamp.add(arm);
  scene.add(pad, padInk, stamp);
  const porcelain = new MeshStandardMaterial({ color: 0xebe7dd, roughness: 0.22 });
  const cup = shadow(
    new Mesh(new LatheGeometry([new Vector2(0, 0.004), new Vector2(0.026, 0.004), new Vector2(0.034, 0.012), new Vector2(0.041, 0.07), new Vector2(0.038, 0.07), new Vector2(0.032, 0.014), new Vector2(0, 0.014)], 40), porcelain),
  );
  const cupHandle = shadow(new Mesh(new TorusGeometry(0.017, 0.004, 8, 20, Math.PI * 1.3), porcelain));
  cupHandle.position.set(0.045, 0.04, 0);
  cupHandle.rotation.z = -Math.PI * 0.65;
  const tea = new Mesh(new CylinderGeometry(0.037, 0.037, 0.002, 32), new MeshStandardMaterial({ color: 0x2a1406, roughness: 0.08 }));
  tea.position.y = 0.056;
  const saucer = shadow(new Mesh(new CylinderGeometry(0.072, 0.06, 0.008, 40), porcelain));
  saucer.position.y = 0.004;
  const tableware = new Group();
  tableware.add(cup, cupHandle, tea, saucer);
  const pen = new Group();
  const penBody = shadow(new Mesh(new CylinderGeometry(0.0058, 0.0048, 0.14, 16), new MeshStandardMaterial({ color: 0x0e0e12, roughness: 0.2, metalness: 0.3 })));
  const nib = shadow(new Mesh(new CylinderGeometry(0.0048, 0.0006, 0.022, 12), brass));
  nib.position.y = -0.081;
  const clip = new Mesh(new BoxGeometry(0.0016, 0.05, 0.002), brass);
  clip.position.set(0, 0.04, 0.006);
  pen.add(penBody, nib, clip);
  pen.rotation.set(0, 0, Math.PI / 2);
  const lens = new Group();
  const rim = shadow(new Mesh(new TorusGeometry(0.036, 0.004, 10, 40), brass));
  rim.rotation.x = Math.PI / 2;
  const lensGlass = new Mesh(new CylinderGeometry(0.035, 0.035, 0.002, 32), new MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.02, clearcoat: 1 }));
  const grip = shadow(new Mesh(new CylinderGeometry(0.0065, 0.0075, 0.085, 14), new MeshStandardMaterial({ color: 0x24160c, roughness: 0.45 })));
  grip.rotation.z = Math.PI / 2;
  grip.position.x = 0.08;
  lens.add(rim, lensGlass, grip);
  scene.add(tableware, pen, lens);

  /* ---------- раскладка: где что на столе ---------- */

  let aspect = 1;
  let portrait = false;
  const STAMP_REST = new Vector3();
  function arrange() {
    portrait = aspect < 0.85;
    // на телефоне кадр узкий — лампу и мелочи ставим ближе к бумагам, чтобы попали в кадр, когда сидим
    const k = portrait ? 0.62 : 1;
    lamp.position.set(-0.5 * k, DESK_Y, -0.3);
    lamp.rotation.y = portrait ? 0.55 : 0.42;
    const headWorld = new Vector3(0, 0.36, 0).applyAxisAngle(new Vector3(0, 1, 0), lamp.rotation.y).add(lamp.position);
    lampLight.position.copy(headWorld).add(new Vector3(0, -0.025, 0)); // чуть ниже абажура
    lampLight.target.position.set(0.02, DESK_Y, 0.02);
    bulb.position.copy(headWorld).add(new Vector3(0, -0.03, 0));
    pad.position.set(0.5 * k + 0.02, DESK_Y + 0.007, 0.17);
    padInk.position.set(pad.position.x, DESK_Y + 0.0145, 0.17);
    STAMP_REST.set(pad.position.x, DESK_Y + 0.014, 0.17);
    if (!stampMove) stamp.position.copy(STAMP_REST);
    tableware.position.set(0.52 * k + 0.04, DESK_Y, -0.2);
    pen.position.set(0.36 * k, DESK_Y + 0.006, 0.28);
    pen.rotation.y = 0.5;
    lens.position.set(-0.42 * k, DESK_Y + 0.0045, 0.23);
    lens.rotation.y = -0.6;
    folder.position.set(portrait ? 0.3 : 0.47, DESK_Y + 0.0008, portrait ? -0.33 : -0.12);
  }

  // Положить листы так, как они лежат на экране. sheets: { protocol, statements? } — от paintSheet():
  // холст и где лист на экране ({ x, y, width, height, angle }); onScreen: false — листа на экране нет.
  let px = 1; // метров в пикселе экрана
  let origin = { x: 0, y: 0 }; // какой точке экрана соответствует середина стола по ширине и верх протокола
  let screenSize = { width: 1, height: 1 };
  const textures = new Map();
  function layout({ protocol: p, statements: st }, screen) {
    px = PROTOCOL_W / p.width;
    const shown = [p, st].filter((s) => s && s.onScreen !== false);
    const left = Math.min(...shown.map((s) => s.x));
    const right = Math.max(...shown.map((s) => s.x + s.width));
    origin = { x: (left + right) / 2, y: p.y };
    const put = (mesh, s, lift) => {
      mesh.visible = true;
      mesh.scale.set(s.width * px, s.height * px, 1);
      mesh.position.set((s.x + s.width / 2 - origin.x) * px, DESK_Y + lift, PAPERS_TOP + (s.y + s.height / 2 - origin.y) * px);
      mesh.rotation.z = -s.angle; // по часовой на экране — против часовой вокруг вертикали стола
      if (s.canvas) {
        textures.get(mesh)?.dispose();
        const t = tex(s.canvas);
        textures.set(mesh, t);
        mesh.material.map = t;
        mesh.material.needsUpdate = true;
      }
    };
    put(protocol, p, LIFT * 3);
    // лист под протоколом — сдвинут на 5×6 пикселей, как тень в 2D
    put(under, { ...p, canvas: null, x: p.x + 5, y: p.y + 6 }, LIFT * 2);
    statements.visible = Boolean(st);
    if (st) put(statements, st, LIFT);
    // показаний на экране нет (телефон) — лист лежит слева от протокола, его видно, когда сидим
    if (st && st.onScreen === false) {
      statements.position.set(protocol.position.x - (p.width / 2 + st.width / 2 + 24) * px, DESK_Y + LIFT, PAPERS_TOP + (st.height / 2) * px + 0.02);
      statements.rotation.z = 0.06;
    }
    screenSize = screen;
    if (at === 'top') place('top');
    else render();
  }

  // Вид сверху: экран ровно над листами — пиксель в пиксель с 2D.
  function topView() {
    const vfov = (camera.fov * Math.PI) / 180;
    const dist = (screenSize.height * px) / (2 * Math.tan(vfov / 2));
    const cx = (screenSize.width / 2 - origin.x) * px;
    const cz = PAPERS_TOP + (screenSize.height / 2 - origin.y) * px;
    return { pos: new Vector3(cx, DESK_Y + LIFT * 3 + dist, cz), look: new Vector3(cx, DESK_Y, cz), up: new Vector3(0, 0, -1) };
  }
  // Стоим у стола и сидим за ним — кадр подбираем под форму экрана.
  const standView = () =>
    portrait
      ? { pos: new Vector3(0.1, 1.72, 1.35), look: new Vector3(-0.02, 0.8, -0.05) }
      : { pos: new Vector3(0.14, 1.62, 1.3), look: new Vector3(0, 0.78, -0.04) };
  const seatView = () =>
    portrait
      ? { pos: new Vector3(0.0, 1.27, 0.66), look: new Vector3(-0.02, DESK_Y, -0.06) }
      : { pos: new Vector3(0.02, 1.22, 0.86), look: new Vector3(0.0, 0.79, -0.16) };

  /* ---------- камера ---------- */

  const pivot = new PerspectiveCamera(); // камера, а не Object3D: lookAt у камеры смотрит вдоль −z
  const orient = ({ pos, look, up = new Vector3(0, 1, 0) }) => {
    pivot.position.copy(pos);
    pivot.up.copy(up);
    pivot.lookAt(look);
    return pivot.quaternion.clone();
  };
  let at = 'stand'; // где сейчас камера: stand | seat | top | stamp
  const VIEWS = { stand: standView, seat: seatView, top: topView };
  function place(name) {
    at = name;
    const view = VIEWS[name]();
    camera.position.copy(view.pos);
    camera.quaternion.copy(orient(view));
    render();
  }

  function resize() {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    aspect = r.width / r.height;
    // узкий экран: шире угол по вертикали, чтобы по ширине стол помещался
    camera.fov = aspect >= 1 ? 46 : Math.min(72, 46 + (1 - aspect) * 50);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    arrange();
    if (!flight && VIEWS[at]) place(at);
    else render();
  }

  // Перелёт камеры: позиция по плавной кривой, поворот — сферической интерполяцией.
  let flight = null;
  let hurry = false; // «пропустить»: текущее движение — сразу в конец, следующие — мгновенно
  function fly(name, ms, view = VIEWS[name]?.()) {
    return new Promise((resolve) => {
      const toQuat = orient(view);
      if (reducedMotion || hurry || ms <= 0) {
        camera.position.copy(view.pos);
        camera.quaternion.copy(toQuat);
        at = name;
        render();
        resolve();
        return;
      }
      flight = { name, from: camera.position.clone(), fromQuat: camera.quaternion.clone(), to: view.pos, toQuat, start: performance.now(), ms, resolve };
      loop();
    });
  }
  const pause = (ms) => new Promise((resolve) => (reducedMotion || hurry ? resolve() : setTimeout(resolve, ms)));

  /* ---------- кадр ---------- */

  let raf = 0;
  let active = true;
  let shake = 0;
  function render() {
    if (active) renderer.render(scene, camera);
  }
  function loop() {
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame() {
    raf = 0;
    const now = performance.now(); // те же часы, что у start: метка rAF может идти по другим

    if (flight) {
      const t = hurry ? 1 : Math.min(1, (now - flight.start) / flight.ms);
      const k = ease(t);
      camera.position.lerpVectors(flight.from, flight.to, k);
      camera.quaternion.slerpQuaternions(flight.fromQuat, flight.toQuat, k);
      if (t >= 1) {
        const done = flight.resolve;
        at = flight.name;
        flight = null;
        done();
      }
    }
    if (stampMove) {
      const m = stampMove;
      const t = hurry ? 1 : Math.min(1, (now - m.start) / m.ms);
      stamp.position.lerpVectors(m.from, m.to, ease(t));
      stamp.position.y += Math.sin(Math.PI * t) * m.arc;
      if (t >= 1) {
        stampMove = null;
        m.resolve();
      }
    }
    if (shake > 0) {
      camera.position.y -= Math.sin(shake * Math.PI) * 0.0025;
      shake = Math.max(0, shake - 0.16);
    }
    render();
    if (flight || shake > 0 || stampMove) loop();
  }

  /* ---------- штамп ---------- */

  let stampMove = null;
  function moveStamp(to, ms, arc = 0) {
    return new Promise((resolve) => {
      if (reducedMotion || hurry) {
        stamp.position.copy(to);
        render();
        resolve();
        return;
      }
      stampMove = { from: stamp.position.clone(), to: to.clone(), start: performance.now(), ms, arc, resolve };
      loop();
    });
  }

  // Точка листа (в пикселях листа) → точка на столе.
  const onSheet = (mesh, sx, sy, sw, sh) => mesh.localToWorld(new Vector3(sx / sw - 0.5, 0.5 - sy / sh, 0));

  // Поставить штамп: камера — к листу, рука берёт штамп с подушечки, удар, оттиск, обратно.
  // mark — от stampOf(): где на протоколе оттиск и как он выглядит; sheet — размер листа в пикселях.
  // onHit — в момент удара (звук).
  async function stampCase(mark, sheet, onHit = () => {}) {
    const spot = onSheet(protocol, mark.cx, mark.cy, sheet.width, sheet.height);
    const view = { pos: spot.clone().add(new Vector3(0.03, 0.36, 0.34)), look: spot.clone().add(new Vector3(0, 0, -0.02)) };
    await fly('stamp', 1000, view);
    const over = spot.clone().setY(DESK_Y + 0.13);
    arm.visible = true;
    await moveStamp(STAMP_REST.clone().setY(DESK_Y + 0.06), 300);
    await moveStamp(over, 620, 0.05);
    await pause(220);
    await moveStamp(spot.clone().setY(DESK_Y + LIFT * 3 + 0.001), 110);
    // удар: оттиск на протоколе
    const map = protocol.material.map;
    const ctx = map.image.getContext('2d');
    const k = map.image.width / sheet.width;
    ctx.save();
    // холст листа уже растянут под разрешение текстуры (paintSheet) — ставим масштаб заново, а не поверх
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawStamp(ctx, mark);
    ctx.restore();
    map.needsUpdate = true;
    shake = reducedMotion ? 0 : 1;
    onHit();
    loop();
    await pause(300);
    await moveStamp(over, 260);
    await pause(120);
    await moveStamp(STAMP_REST.clone().setY(DESK_Y + 0.06), 560, 0.04);
    await moveStamp(STAMP_REST, 200);
    arm.visible = false;
    render();
    await pause(500);
  }

  /* ---------- нажатия: бумаги — «к делу» ---------- */

  const ray = new Raycaster();
  const pointer = new Vector2();
  const onPaper = (event) => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    return ray.intersectObjects([...papers, folder]).length > 0;
  };
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || flight) return;
    renderer.domElement.style.cursor = onPaper(event) ? 'pointer' : '';
  });

  const resizer = new ResizeObserver(resize);
  resizer.observe(host);
  resize();
  place('stand');

  return {
    layout,
    place,
    // сесть за стол / наклониться к бумагам
    sit: (ms = 1700) => fly('seat', ms),
    lean: (ms = 1300) => fly('top', ms),
    stamp: stampCase,
    pause,
    // нажали на бумаги (или папку)?
    isPaper: (event) => event.target === renderer.domElement && onPaper(event),
    get at() {
      return at;
    },
    // пропустить анимацию: текущая доходит до конца сразу, следующие — мгновенно
    hurry(on = true) {
      hurry = on;
      if (on) loop();
    },
    // в 2D кабинет не рисуем — экономим батарею
    setActive(on) {
      active = on;
      if (on) render();
    },
    destroy() {
      cancelAnimationFrame(raf);
      resizer.disconnect();
      renderer.dispose();
      host.replaceChildren();
    },
  };
}
