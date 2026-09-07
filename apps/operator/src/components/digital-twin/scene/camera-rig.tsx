"use client";

import { forwardRef, useImperativeHandle, useRef, type ComponentRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export interface CameraRigPosition {
  x: number;
  z: number;
  /** Radians, top-down facing angle (atan2 of the camera's forward vector projected onto the ground plane). */
  angle: number;
}

export interface CameraRigHandle {
  /** Smoothly returns the camera to its initial position/target over a few frames. */
  reset: () => void;
  /** Read-only snapshot of the live camera position/facing, for the Mini-map — doesn't affect camera behavior. */
  getPosition: () => CameraRigPosition;
  /**
   * Camera Follow Mode: pass a live Object3D to smoothly chase it every
   * frame (orbit input is suspended while following, so it can't fight the
   * programmatic follow update); pass `null` to exit — control returns to
   * ordinary orbit exactly where the camera ended up, no snap. Orbit mode's
   * own behavior when NOT following is unchanged by any of this.
   */
  follow: (target: THREE.Object3D | null) => void;
}

// Cinematic default (009C.6): higher and further back than the previous
// close-in angle so the whole farm — including the new horizon backdrop —
// is framed on load, without changing any orbit/reset/follow behavior.
// Kept within OrbitControls' existing `maxDistance` (55) below so the very
// first frame's damping update can't yank the camera inward on mount.
const INITIAL_POSITION = new THREE.Vector3(30, 22, 34);
const INITIAL_TARGET = new THREE.Vector3(0, 0, 0);
const RESET_LERP_FACTOR = 0.12;
const RESET_SNAP_EPSILON = 0.02;
const FOLLOW_LERP_FACTOR = 0.09;
const FOLLOW_OFFSET = new THREE.Vector3(0, 5, 9);
const FOLLOW_LOOK_OFFSET = new THREE.Vector3(0, 1, 0);

// `minPolarAngle`/`maxPolarAngle` below only bound rotation *relative to the
// orbit target* — they don't stop panning (009D.5) from dragging the target
// (and the camera along with it) below ground first, after which those same
// angle limits no longer prevent looking up from underneath the terrain.
// Clamping both every frame closes that gap without touching the angle
// limits or how rotate/zoom/pan themselves work.
const MIN_TARGET_HEIGHT = 0;
const MIN_CAMERA_HEIGHT = 1.5;

/**
 * A stable plain-array tuple (module-scope, created once) for handing to
 * `<PerspectiveCamera position={...}>`. R3F re-applies an object3D `position`
 * prop to the live camera whenever the array *reference* changes — an inline
 * `INITIAL_POSITION.toArray()` in JSX would create a new array every render
 * and yank the camera back to its start position on any unrelated re-render
 * (e.g. toggling a layer switch), fighting the user's own orbit/pan input.
 */
export const CAMERA_INITIAL_POSITION_ARRAY: [number, number, number] = [
  INITIAL_POSITION.x,
  INITIAL_POSITION.y,
  INITIAL_POSITION.z,
];

/**
 * Owns the camera + its orbit/pan/zoom controls. `reset()` is exposed via a
 * ref so UI outside the `<Canvas>` tree (the Toolbar) can trigger it.
 *
 * The controls ref is typed via `ComponentRef<typeof OrbitControls>` rather
 * than a hand-written interface: a ref's `current` is read as the exact
 * instance type the component writes into it, so a narrower custom type
 * isn't assignable there (assignability runs the other way for a readonly
 * ref) — deriving the type from the component itself avoids depending on
 * three-stdlib's class name directly while staying exactly correct.
 */
export const CameraRig = forwardRef<CameraRigHandle>(function CameraRig(_props, ref) {
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const resetting = useRef(false);
  const forward = useRef(new THREE.Vector3());
  const followTarget = useRef<THREE.Object3D | null>(null);
  const followTargetWorldPos = useRef(new THREE.Vector3());
  const followDesiredCameraPos = useRef(new THREE.Vector3());
  const followDesiredTarget = useRef(new THREE.Vector3());

  useImperativeHandle(ref, () => ({
    reset: () => {
      followTarget.current = null;
      if (controlsRef.current) controlsRef.current.enabled = true;
      resetting.current = true;
    },
    getPosition: () => {
      camera.getWorldDirection(forward.current);
      return {
        x: camera.position.x,
        z: camera.position.z,
        angle: Math.atan2(forward.current.x, forward.current.z),
      };
    },
    follow: (target) => {
      followTarget.current = target;
      if (controlsRef.current) controlsRef.current.enabled = target === null;
    },
  }));

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    let groundClamped = false;
    if (controls.target.y < MIN_TARGET_HEIGHT) {
      controls.target.y = MIN_TARGET_HEIGHT;
      groundClamped = true;
    }
    if (camera.position.y < MIN_CAMERA_HEIGHT) {
      camera.position.y = MIN_CAMERA_HEIGHT;
      groundClamped = true;
    }
    if (groundClamped) controls.update();

    if (followTarget.current) {
      followTarget.current.getWorldPosition(followTargetWorldPos.current);
      followDesiredCameraPos.current.copy(followTargetWorldPos.current).add(FOLLOW_OFFSET);
      followDesiredTarget.current.copy(followTargetWorldPos.current).add(FOLLOW_LOOK_OFFSET);

      camera.position.lerp(followDesiredCameraPos.current, FOLLOW_LERP_FACTOR);
      controls.target.lerp(followDesiredTarget.current, FOLLOW_LERP_FACTOR);
      controls.update();
      return;
    }

    if (!resetting.current) return;

    camera.position.lerp(INITIAL_POSITION, RESET_LERP_FACTOR);
    controls.target.lerp(INITIAL_TARGET, RESET_LERP_FACTOR);
    controls.update();

    if (camera.position.distanceTo(INITIAL_POSITION) < RESET_SNAP_EPSILON) {
      camera.position.copy(INITIAL_POSITION);
      controls.target.copy(INITIAL_TARGET);
      controls.update();
      resetting.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={10}
      maxDistance={55}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI / 2 - 0.05}
      enablePan
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.PAN,
      }}
    />
  );
});
