/*
 * The sock in 3D.
 *
 * three.js is loaded on demand — it is several times the size of the rest of
 * the app, and most visitors never leave the flat view. Until you tap "3D"
 * none of it is fetched.
 *
 * The mesh comes from sockMesh.ts (pure maths, no three), the texture from
 * texture.ts (the same path data the SVG uses), and this file is only the
 * plumbing: scene, lights, a turntable, and — the part that is easy to forget
 * — disposing of all of it when the view goes away.
 */

import { useEffect, useRef, useState } from 'react';
import type * as THREE_NS from 'three';
import { buildSockMesh, meshBounds } from './sockMesh';
import { paintSockTexture, printSpots } from './texture';
import { HEIGHTS } from '../store/catalog';
import type { Design } from '../store/design';
import { prefersReducedMotion } from '../brand/ticker';

const TEX_W = 1024;
const TEX_H = 2048;

type Status = 'loading' | 'ready' | 'unsupported' | 'failed';

export function SockThree({ design, className }: { design: Design; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('loading');

  // Everything three-related lives here so the effect that builds the scene
  // can stay out of the render path, and so teardown has one place to look.
  const kit = useRef<{
    THREE: typeof THREE_NS;
    renderer: THREE_NS.WebGLRenderer;
    scene: THREE_NS.Scene;
    camera: THREE_NS.PerspectiveCamera;
    pivot: THREE_NS.Group;
    mesh: THREE_NS.Mesh;
    texture: THREE_NS.CanvasTexture;
    canvas: HTMLCanvasElement;
    frame: number | null;
    spin: number;
    dragging: boolean;
    resumeAt: number;
    heightId: string;
    landmarks: ReturnType<typeof buildSockMesh>['landmarks'];
    metrics: ReturnType<typeof buildSockMesh>['metrics'];
  } | null>(null);

  const designRef = useRef(design);
  designRef.current = design;

  // --- Build the scene once ------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const el = host.current;
      if (!el) return;

      let THREE: typeof THREE_NS;
      try {
        THREE = await import('three');
      } catch {
        if (!cancelled) setStatus('failed');
        return;
      }
      if (cancelled) return;

      let renderer: THREE_NS.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        // No WebGL: old device, blocked, or software rendering disabled. The
        // flat view is still there, and it is the one that is to scale anyway.
        if (!cancelled) setStatus('unsupported');
        return;
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      el.appendChild(renderer.domElement);
      renderer.domElement.style.touchAction = 'none';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.setAttribute('aria-label', 'A 3D sock you can drag to spin');

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, el.clientWidth / el.clientHeight, 0.5, 400);

      // Light it like a product shot: a key from the front-left, a cool fill
      // from behind, and sky/ground bounce so the underside is never black.
      scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f7d, 1.5));
      const key = new THREE.DirectionalLight(0xfff6e6, 2.1);
      key.position.set(-14, 22, 18);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xdfe7ff, 1.1);
      rim.position.set(16, 6, -18);
      scene.add(rim);

      const canvas = document.createElement('canvas');
      canvas.width = TEX_W;
      canvas.height = TEX_H;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      /*
       * three flips textures vertically by default, which is right for image
       * files and wrong here. The mesh runs v = 0 at the cuff to v = 1 at the
       * toe, and the canvas is painted the same way down the page — with the
       * flip on, v = 0 samples the bottom of the canvas, so the sock wore its
       * toe block at the cuff and its cuff print halfway down the foot.
       */
      texture.flipY = false;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

      const material = new THREE.MeshPhysicalMaterial({
        map: texture,
        roughness: 0.92,
        metalness: 0,
        // A little sheen is what stops it reading as moulded plastic.
        sheen: 0.6,
        sheenRoughness: 0.85,
        sheenColor: new THREE.Color(0xffffff),
      });

      const geometry = new THREE.BufferGeometry();
      const mesh = new THREE.Mesh(geometry, material);
      const pivot = new THREE.Group();
      pivot.add(mesh);
      scene.add(pivot);

      kit.current = {
        THREE,
        renderer,
        scene,
        camera,
        pivot,
        mesh,
        texture,
        canvas,
        frame: null,
        // Open on the printed side, turned a little so the foot still reads as
        // a foot. Which side of a sock is "outer" depends on which foot it is
        // on, so this is simply the side the print is on facing the viewer.
        spin: -Math.PI / 2 - 0.42,
        dragging: false,
        resumeAt: 0,
        heightId: '',
        landmarks: { cuffEnd: 0, heel: 0, toeStart: 0 },
        metrics: { lengthCm: 42, circumferenceCm: 19 },
      };

      rebuildGeometry();
      repaint();
      frameCamera();

      const loop = () => {
        const k = kit.current;
        if (!k) return;
        k.frame = requestAnimationFrame(loop);
        const idle = !k.dragging && Date.now() > k.resumeAt && !prefersReducedMotion();
        if (idle) k.spin += 0.004;
        k.pivot.rotation.y = k.spin;
        k.renderer.render(k.scene, k.camera);
      };
      loop();

      const observer = new ResizeObserver(() => {
        const k = kit.current;
        if (!k || !host.current) return;
        const w = host.current.clientWidth;
        const h = host.current.clientHeight;
        if (w === 0 || h === 0) return;
        k.renderer.setSize(w, h, false);
        k.camera.aspect = w / h;
        k.camera.updateProjectionMatrix();
      });
      observer.observe(el);

      if (!cancelled) setStatus('ready');

      return () => observer.disconnect();
    })();

    return () => {
      cancelled = true;
      const k = kit.current;
      if (!k) return;
      if (k.frame !== null) cancelAnimationFrame(k.frame);
      // Textures, geometry and the GL context are not garbage collected on
      // their own — leaving them behind leaks the GPU memory of every visit.
      k.mesh.geometry.dispose();
      (k.mesh.material as THREE_NS.Material).dispose();
      k.texture.dispose();
      k.renderer.dispose();
      k.renderer.domElement.remove();
      kit.current = null;
    };
  }, []);

  function rebuildGeometry() {
    const k = kit.current;
    if (!k) return;
    const d = designRef.current;
    const height = HEIGHTS.find((h) => h.id === d.heightId) ?? HEIGHTS[1];

    const { positions, uvs, indices, landmarks, metrics } = buildSockMesh({ legLength: height.legCm });
    const g = new k.THREE.BufferGeometry();
    g.setAttribute('position', new k.THREE.BufferAttribute(positions, 3));
    g.setAttribute('uv', new k.THREE.BufferAttribute(uvs, 2));
    g.setIndex(new k.THREE.BufferAttribute(indices, 1));
    g.computeVertexNormals();

    const { min, max } = meshBounds(positions);
    g.translate(-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -(min[2] + max[2]) / 2);

    k.mesh.geometry.dispose();
    k.mesh.geometry = g;
    k.landmarks = landmarks;
    k.metrics = metrics;
    k.heightId = d.heightId;
  }

  function frameCamera() {
    const k = kit.current;
    if (!k) return;
    k.mesh.geometry.computeBoundingSphere();
    const r = k.mesh.geometry.boundingSphere?.radius ?? 20;
    const dist = r / Math.sin((k.camera.fov * Math.PI) / 360);
    // A little further out than a tight fit: the sock turns, and its widest
    // silhouette should not clip the frame at any angle.
    k.camera.position.set(0, r * 0.1, dist * 1.06);
    k.camera.lookAt(0, 0, 0);
  }

  function repaint() {
    const k = kit.current;
    if (!k) return;
    const ctx = k.canvas.getContext('2d');
    if (!ctx) return;
    const d = designRef.current;

    // Texture scale comes from the mesh itself, so a 2.9cm print is 2.9cm on
    // the sock rather than 2.9cm of some assumed sock.
    const pxPerCmU = TEX_W / k.metrics.circumferenceCm;
    const pxPerCmV = TEX_H / k.metrics.lengthCm;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, TEX_W, TEX_H);
    paintSockTexture(ctx, d, {
      width: TEX_W,
      height: TEX_H,
      landmarks: k.landmarks,
      pxPerCmU,
      pxPerCmV,
    });

    if (d.photo) {
      // The photo has to be decoded before it can be drawn, so the texture is
      // painted once without it and again when it arrives.
      const img = new Image();
      img.onload = () => {
        const kk = kit.current;
        if (!kk) return;
        for (const spot of printSpots(d, kk.landmarks)) {
          const x = spot.u * TEX_W;
          const y = spot.v * TEX_H;
          const rx = (spot.cm * pxPerCmU) / 2;
          const ry = (spot.cm * pxPerCmV) / 2;
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
          ctx.clip();
          const box = Math.max(rx, ry) * 2 * d.photo!.scale;
          ctx.drawImage(
            img,
            x - box / 2 + (d.photo!.x / 100) * rx,
            y - box / 2 + (d.photo!.y / 100) * ry,
            box,
            box,
          );
          ctx.restore();
        }
        kk.texture.needsUpdate = true;
      };
      img.src = d.photo.src;
    }

    k.texture.needsUpdate = true;
  }

  // --- Re-apply the design as it changes -----------------------------------
  useEffect(() => {
    const k = kit.current;
    if (!k || status !== 'ready') return;
    if (k.heightId !== design.heightId) {
      rebuildGeometry();
      frameCamera();
    }
    repaint();
  }, [design, status]);

  // --- Turntable -----------------------------------------------------------
  useEffect(() => {
    const el = host.current;
    if (!el || status !== 'ready') return;

    let lastX = 0;
    let id: number | null = null;

    const down = (e: PointerEvent) => {
      const k = kit.current;
      if (!k) return;
      id = e.pointerId;
      lastX = e.clientX;
      k.dragging = true;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const k = kit.current;
      if (!k || id !== e.pointerId || !k.dragging) return;
      k.spin += (e.clientX - lastX) * 0.011;
      lastX = e.clientX;
    };
    const up = (e: PointerEvent) => {
      const k = kit.current;
      if (!k || id !== e.pointerId) return;
      k.dragging = false;
      // Let it sit where it was left for a moment before drifting again.
      k.resumeAt = Date.now() + 2600;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      id = null;
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [status]);

  return (
    <div className={['three', className].filter(Boolean).join(' ')}>
      <div ref={host} className="three__stage" style={{ touchAction: 'none' }} />
      {status === 'loading' && <p className="three__note">Loading the 3D view…</p>}
      {status === 'unsupported' && (
        <p className="three__note">
          This browser can't do 3D. The flat view is the accurate one anyway — it's drawn to scale.
        </p>
      )}
      {status === 'failed' && <p className="three__note">The 3D view failed to load. The flat view still works.</p>}
      {status === 'ready' && <p className="three__note">Drag to spin. The flat view is the one drawn to scale.</p>}
    </div>
  );
}
