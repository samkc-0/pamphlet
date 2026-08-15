import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const BOOK_MODEL_URL = "/models/Book.fbx";

export function BookLoadingOverlay({
  animated = true,
  label = "Loading"
}: {
  animated?: boolean;
  label?: string;
}) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="fixed inset-0 z-40 grid place-items-center bg-white text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100"
    >
      <BookModel animated={animated} />
    </div>
  );
}

function BookModel({ animated }: { animated: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasModel, setHasModel] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;

    if (!canvas || !parent) return;

    const container = parent;
    let animationFrame = 0;
    let disposed = false;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas
    });
    const modelRoot = new THREE.Group();
    const resizeObserver = new ResizeObserver(() => resizeRenderer());

    camera.position.set(0, 0.35, 4);
    scene.add(new THREE.AmbientLight(0xffffff, 2.2));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(2, 3, 4);
    scene.add(keyLight);
    scene.add(modelRoot);

    renderer.setClearAlpha(0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    resizeObserver.observe(container);
    resizeRenderer();

    new FBXLoader().load(
      BOOK_MODEL_URL,
      (model) => {
        if (disposed) return;

        centerAndScaleModel(model);
        modelRoot.add(model);
        setHasModel(true);
      },
      undefined,
      () => {
        if (!disposed) {
          setHasModel(false);
        }
      }
    );

    const render = () => {
      if (animated) {
        modelRoot.rotation.y += 0.03;
        modelRoot.rotation.x = -0.18 + Math.sin(performance.now() / 700) * 0.04;
        modelRoot.rotation.z = Math.sin(performance.now() / 900) * 0.08;
      } else {
        modelRoot.rotation.x = -0.18;
        modelRoot.rotation.y = 0.7;
        modelRoot.rotation.z = 0;
      }

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };

    render();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      disposeObject(scene);
      renderer.dispose();
    };

    function resizeRenderer() {
      const { height, width } = container.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.floor(width));
      const nextHeight = Math.max(1, Math.floor(height));

      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight, false);
    }
  }, [animated]);

  return (
    <div className="h-56 w-56 sm:h-72 sm:w-72">
      {hasModel ? (
        <canvas
          aria-hidden="true"
          className="h-full w-full opacity-85"
          ref={canvasRef}
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-4xl opacity-60">
          <span aria-hidden="true">▰</span>
        </div>
      )}
    </div>
  );
}

function centerAndScaleModel(model: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const largestSide = Math.max(size.x, size.y, size.z, 1);
  const scale = 2.15 / largestSide;

  model.position.sub(center);
  model.scale.setScalar(scale);
  model.rotation.set(0, 0, 0);
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    child.geometry.dispose();

    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
    } else {
      child.material.dispose();
    }
  });
}
