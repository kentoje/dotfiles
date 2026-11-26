# Altair Neru navigation

`altair-neru.vil` is the layout read back from the connected Altair after configuring
it through Vial's raw USB HID protocol. `altair-before-neru.vil` restores the previous
keymap and Tap Dance configuration. Both import through Vial's File → Load saved
layout command; they leave macros, combos, key overrides, and QMK settings alone.

The inner key immediately left of Y (matrix row 6, column 0, previously Alt+Comma)
is now `OSL(5)` directly:

- Tap: `OSL(5)` activates the Neru layer for the next key.
- No Tap Dance or separate movement-layer hold action is assigned to this key.
- Layer 5 reproduces all 30 F-key chords from the Glove80 Neru_Nav screenshot.
- Other keys on layer 5 remain transparent.
- The existing global one-shot timeout remains 5000 ms.

Tap and release the key, then press a Neru shortcut key. After that keypress,
the keyboard returns to the base layer. The 150/200 ms Tap Dance threshold no
longer applies. `TG(5)` is the alternative for keeping layer 5 active across
multiple keypresses until the trigger is pressed again.

Examples after tapping the trigger:

| Physical key | Emitted chord | Neru action |
| --- | --- | --- |
| W | F13 | Screen vision hints |
| R | F15 | Right-click hints |
| T | F16 | Double-click hints |
| S | F17 | Scroll mode |
| F | F19 | Save cursor and show hints |
| G | F20 | Save cursor and show grid |
| H | Ctrl+F17 | Move-mouse hints |
| J | Ctrl+F18 | Center pointer |
| A | Shift+F14 | Vision hints |
| C | Alt+F14 | Recursive grid |
| B | Alt+F16 | Bisect |
| N | Alt+F17 | Toggle navigation mode |
| / | Shift+F18 | Search hints |

Verification: every written key was read back, then the USB device was reopened
and the complete keymap and all Tap Dances were compared. All 14 configured Neru
F-key shortcuts are present. Global QMK settings were verified unchanged.
Physical key timing and OS delivery still need a hands-on check.

References: [Vial Tap Dance](https://get.vial.today/manual/tap-dance.html),
[Vial layers](https://get.vial.today/manual/layers.html),
[Vial Tap Dance implementation](https://github.com/vial-kb/vial-qmk/blob/vial/quantum/vial.c).
