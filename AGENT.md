# AGENT.md — Dance Demo 3 Puppet Rigging

## Completed: 2026-08-21

### Task
Abandon single-image CSS warping approach for dance feature in `dance_demo3.html`.
Implement multi-layered CSS puppet rigging instead.

### Implementation Summary

**File:** `frontend/dance_demo3.html`

#### 1. Multi-Layered CSS Puppet Rigging
- Each character (boy, girl) is decomposed into **5 independent body segments**:
  - **Head** — skull, face, eyes (z-index:10)
  - **Torso** — chest block (z-index:5)
  - **Left Arm** — upper, lower, hand (z-index:4)
  - **Right Arm** — upper, lower, hand (z-index:4)
  - **Legs** — left/right leg + feet (z-index:3)
- Each segment is a `<div class="seg">` absolutely positioned within a `.character` container
- No single-image warping — every segment moves independently via CSS transforms

#### 2. Boy Arm Detachment
- Boy arms positioned at `left:14px`/`right:14px` (freely offset from hip/pocket area)
- Girl arms positioned closer at `left:12px`/`right:12px` (attached style)
- Each arm swings independently from its own transform-origin

#### 3. CSS Keyframe Animations — Step-Timed, Small Pixel Shifts
All animations use `steps()` timing function for rhythmic, beat-matched motion.

**Boy Character:**
| Segment | Animation | Duration | Shift Range |
|---------|-----------|----------|-------------|
| Head | `boy-head-dance` | 1.2s / 8 steps | -3px to +2px Y, ±1.5deg rotate |
| Torso | `boy-torso-dance` | 1.6s / 4 steps | -1px to +3px X, ±1deg rotate |
| Left Arm | `boy-arm-left-dance` | 1.0s / 5 steps | ±2px Y, ±8deg rotate |
| Right Arm | `boy-arm-right-dance` | 1.0s / 5 steps | ±1px Y, ±7deg rotate |
| Legs | `boy-legs-dance` | 0.8s / 5 steps | -2px to +1px Y, ±0.5deg skew |

**Girl Character (1.15x speed, different rhythm):**
| Segment | Animation | Duration | Shift Range |
|---------|-----------|----------|-------------|
| Head | `girl-head-dance` | 1.04s / 8 steps | -4px to +2px Y, ±1.5deg rotate |
| Torso | `girl-torso-dance` | 1.39s / 4 steps | -3px to +3px X, ±1.2deg rotate |
| Left Arm | `girl-arm-left-dance` | 0.87s / 6 steps | ±2px XY, ±7deg rotate |
| Right Arm | `girl-arm-right-dance` | 0.87s / 6 steps | ±2px XY, ±6deg rotate |
| Legs | `girl-legs-dance` | 0.7s / 4 steps | -3px to +1px Y, ±0.6deg skew |

#### 4. YouTube API Integration (Unchanged)
- YouTube IFrame Player API loads via dynamic `<script>` injection
- `onPlayerStateChange` handler calls `startDance()` / `pauseDance()` to toggle `animation-play-state`
- Playlists with 5 tracks, next/prev controls
- Beat indicator dots pulse in sync (250ms interval)

#### Architecture Notes
- **Zero external image dependencies** — characters built with CSS shapes (gradients, border-radius, absolute positioning)
- All animations paused by default (`animation-play-state: paused`)
- `stage.playing` class toggles all segment animations to `running`
- CSS custom properties (`--head-anim`, `--torso-anim`, etc.) parameterize animation names per character
- `--dance-speed` variable scales all segment durations proportionally
