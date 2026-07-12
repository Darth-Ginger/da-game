// Touch control scheme for phones/tablets:
//   left half of the screen  — floating analog joystick (appears where the
//                              thumb lands); push past ~90 % to run
//   right half of the screen — drag to look
//   LIGHT button             — toggles the camcorder lamp
// Movement is analog: the stick's deflection scales walk speed.

const JOY_RADIUS = 64; // px of full deflection

export class TouchControls {
  constructor(dom) {
    this.active = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.move = { x: 0, y: 0 };   // strafe / forward, each in [-1, 1]
    this.lookDX = 0;              // accumulated px since last consume
    this.lookDY = 0;
    this.onLight = null;

    if (!this.active) return;

    this.moveId = null;
    this.lookId = null;
    this.joyOrigin = { x: 0, y: 0 };
    this.lastLook = { x: 0, y: 0 };

    this.base = document.getElementById('joyBase');
    this.knob = document.getElementById('joyKnob');
    const btnLight = document.getElementById('btnLight');
    btnLight.addEventListener('touchstart', e => {
      e.preventDefault();
      e.stopPropagation();
      if (this.onLight) this.onLight();
    }, { passive: false });

    dom.addEventListener('touchstart', e => this.onStart(e), { passive: false });
    dom.addEventListener('touchmove', e => this.onMove(e), { passive: false });
    dom.addEventListener('touchend', e => this.onEnd(e), { passive: false });
    dom.addEventListener('touchcancel', e => this.onEnd(e), { passive: false });
  }

  /** Look deltas accumulated since the last frame. */
  consumeLook() {
    const dx = this.lookDX, dy = this.lookDY;
    this.lookDX = 0;
    this.lookDY = 0;
    return { dx, dy };
  }

  get magnitude() {
    return Math.min(1, Math.hypot(this.move.x, this.move.y));
  }

  onStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < window.innerWidth * 0.5 && this.moveId === null) {
        this.moveId = t.identifier;
        this.joyOrigin.x = t.clientX;
        this.joyOrigin.y = t.clientY;
        this.base.style.display = 'block';
        this.base.style.left = t.clientX + 'px';
        this.base.style.top = t.clientY + 'px';
        this.setKnob(0, 0);
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.lastLook.x = t.clientX;
        this.lastLook.y = t.clientY;
      }
    }
  }

  onMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveId) {
        let dx = (t.clientX - this.joyOrigin.x) / JOY_RADIUS;
        let dy = (t.clientY - this.joyOrigin.y) / JOY_RADIUS;
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        this.move.x = dx;
        this.move.y = -dy; // screen-up = forward
        this.setKnob(dx, dy);
      } else if (t.identifier === this.lookId) {
        this.lookDX += t.clientX - this.lastLook.x;
        this.lookDY += t.clientY - this.lastLook.y;
        this.lastLook.x = t.clientX;
        this.lastLook.y = t.clientY;
      }
    }
  }

  onEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveId) {
        this.moveId = null;
        this.move.x = 0;
        this.move.y = 0;
        this.base.style.display = 'none';
      } else if (t.identifier === this.lookId) {
        this.lookId = null;
      }
    }
  }

  setKnob(dx, dy) {
    this.knob.style.transform =
      `translate(calc(-50% + ${dx * JOY_RADIUS * 0.6}px), calc(-50% + ${dy * JOY_RADIUS * 0.6}px))`;
  }
}
