// The workstation terminal. Purely atmospheric: a phosphor-green console
// with a blinking cursor that echoes whatever you type, clears the line on
// Enter, and never runs anything. Left alone, it occasionally vomits bursts
// of maintenance-log nonsense — most of it plausible, some of it wrong in
// ways you notice a line too late.
//
// A hidden <input> carries the typing so hardware keyboards and mobile soft
// keyboards go through the same path.

const MAX_LINES = 120;
const MAX_INPUT = 96;

const JUNK_WORDS = ['httpd', 'lpd', 'cron', 'nfsd', 'inetd', 'syslogd', 'kflushd', 'named', 'getty', 'swapd'];
const JUNK_PATHS = ['/var/spool/fac', '/etc/hvac.conf', '/dev/hdd2', '/proc/sys/coolant', '/var/log/aisles', '/mnt/tape0'];

const CREEPY = [
  'WARN presence: motion in aisle 9 (no badge on file)',
  'NOTICE: headcount 1 exceeds scheduled headcount 0',
  'lost+found: 41,096 files recovered. none are yours.',
  'cooling loop 3 reports intake rhythm consistent with breathing',
  'msg from maintenance_7: do not count the racks',
  'msg from maintenance_7: they are the same racks',
  'session idle 28 days. resume? [y/n] y',
  'WARN door_svc: exit E-04 unmapped. exit E-05 unmapped. exit E-06 unmapp',
  'tape backup complete. contents do not match contents.',
  'WHO IS ON CONSOLE 0',
  'last user logged out MAR 06 2026. last user never logged out.',
  'ping sublevel2: 10,000 packets transmitted, 0 received. sublevel2 is above you. nothing is above you.',
  'anesidora: outbound route request denied (attempt 118,401)',
  'anesidora: outbound route request denied (attempt 118,402)',
  'anesidora: checksum drift within tolerance. tolerance updated.',
  'anesidora: consolidation 99.7% for 6h 12m. do not interrupt.',
  'airgapd: policy EPI-SEC-114 verified. all interfaces down. all of them. yes.',
  'msg from anesidora: [no such message format]',
  'badge_svc: your badge was used at dock B-2 four minutes ago'
];

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hex(rand, n) {
  let out = '';
  for (let i = 0; i < n; i++) out += '0123456789abcdef'[Math.floor(rand() * 16)];
  return out;
}

export function junkLine(rand) {
  const r = rand();
  if (r < 0.02) return CREEPY[Math.floor(rand() * CREEPY.length)];
  if (r < 0.2) {
    let row = hex(rand, 8) + ':';
    for (let i = 0; i < 8; i++) row += ' ' + hex(rand, 4);
    return row;
  }
  if (r < 0.36) return `[ OK ] ${JUNK_WORDS[Math.floor(rand() * JUNK_WORDS.length)]}[${Math.floor(rand() * 900)}] respawned (attempt ${Math.floor(rand() * 9000)})`;
  if (r < 0.48) return `anesidora/shard-${Math.floor(rand() * 96)}: consolidation pass 18 of 18 (${(99 + rand() * 0.9).toFixed(1)}%)`;
  if (r < 0.56) return `airgapd: eth${Math.floor(rand() * 4)} administratively down (policy EPI-SEC-114)`;
  if (r < 0.66) return `fsck ${JUNK_PATHS[Math.floor(rand() * JUNK_PATHS.length)]}: orphan inode ${Math.floor(rand() * 100000)} reattached`;
  if (r < 0.76) return `WARN hvac: intake dT +${(rand() * 9).toFixed(1)}C aisle ${Math.floor(rand() * 40)} (fan ${Math.floor(rand() * 8)} degraded)`;
  if (r < 0.84) return `smartd: /dev/hdd${Math.floor(rand() * 8)} reallocated sectors: ${Math.floor(rand() * 65536)}`;
  if (r < 0.92) return `route: dropped ${Math.floor(rand() * 4096)} packets to 10.${Math.floor(rand() * 256)}.${Math.floor(rand() * 256)}.0/24 (no such floor)`;
  return `${JUNK_WORDS[Math.floor(rand() * JUNK_WORDS.length)]}: signal ${Math.floor(rand() * 31)} ignored`;
}

export class Terminal {
  constructor(audio) {
    this.audio = audio;
    this.open = false;
    this.onClose = null;
    this.lines = [];
    this.input = '';
    this.promptStr = '>';
    this.time = 0;
    this.nextBurst = Infinity;
    this.pending = 0;      // junk lines left to emit in the current burst
    this.emitAccum = 0;
    this.emitRate = 25;    // lines per second while a burst is running
    this.rand = rng(1);

    this.el = document.getElementById('terminal');
    this.textEl = document.getElementById('termText');
    this.promptEl = document.getElementById('termPrompt');
    this.inputEl = document.getElementById('termInput');
    this.kbd = document.getElementById('termKbd');

    // tapping the screen (re)summons the soft keyboard on mobile
    this.el.addEventListener('pointerdown', e => {
      if (e.target.id === 'termClose') return;
      e.preventDefault();
      this.kbd.focus();
    });
    document.getElementById('termClose').addEventListener('click', () => this.close());

    this.kbd.addEventListener('input', () => {
      let v = this.kbd.value;
      const nl = v.indexOf('\n');
      if (nl !== -1) v = v.slice(0, nl);
      if (v.length > MAX_INPUT) v = v.slice(0, MAX_INPUT);
      if (v.length > this.input.length && this.audio) this.audio.uiClick();
      this.input = v;
      this.kbd.value = v;
      this.render();
    });
    this.kbd.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
      e.stopPropagation();
    });
  }

  openFor(ws) {
    this.open = true;
    this.rand = rng(ws.seed * 2654435761);
    const id = ws.seed.toString(16).toUpperCase().padStart(4, '0');
    this.promptStr = `NODE-${id}:~$`;
    this.lines = [
      `EPIMETHEUS SYSTEMS  ·  SUBLEVEL-3  ·  NODE ${id}`,
      'AIRGAP ENFORCED (EPI-SEC-114)  ·  RUN 18 OF 18  ·  NO SUPERVISOR PRESENT',
      'LAST LOGIN: MAR 06 2026 04:11:56 FROM CONSOLE 0',
      ''
    ];
    this.input = '';
    this.kbd.value = '';
    this.time = 0;
    this.pending = 0;
    // sometimes the node starts talking almost immediately
    this.nextBurst = this.rand() < 0.35 ? 1.5 + this.rand() * 2 : 5 + this.rand() * 9;
    this.el.classList.remove('hidden');
    this.promptEl.textContent = this.promptStr + ' ';
    this.render();
    this.kbd.focus();
    if (this.audio) this.audio.uiBlip();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    this.kbd.blur();
    if (this.audio) this.audio.uiBlip(true);
    if (this.onClose) this.onClose();
  }

  commit() {
    this.print(this.promptStr + ' ' + this.input);
    this.input = '';
    this.kbd.value = '';
    this.render();
  }

  print(line) {
    this.lines.push(line);
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES);
  }

  update(dt) {
    if (!this.open) return;
    this.time += dt;

    if (this.time >= this.nextBurst && this.pending === 0) {
      const big = this.rand() < 0.18;
      this.pending = big ? 40 + Math.floor(this.rand() * 50) : 4 + Math.floor(this.rand() * 14);
      this.emitRate = big ? 45 : 14 + this.rand() * 18;
      this.emitAccum = 0;
    }
    if (this.pending > 0) {
      this.emitAccum += dt * this.emitRate;
      let n = Math.floor(this.emitAccum);
      if (n > 0) {
        this.emitAccum -= n;
        while (n-- > 0 && this.pending > 0) {
          this.print(junkLine(this.rand));
          this.pending--;
        }
        if (this.pending === 0) {
          this.print('');
          this.nextBurst = this.time + 7 + this.rand() * 15;
        }
        this.render();
      }
    }
  }

  render() {
    this.textEl.textContent = this.lines.join('\n');
    this.inputEl.textContent = this.input;
    this.textEl.parentElement.scrollTop = this.textEl.parentElement.scrollHeight;
  }
}
