'use client';

import { Suspense, useRef, useEffect, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import FlagshipOfficeScene from '@/components/3d/FlagshipOfficeScene';
import { OFFICE_ZONES } from '@/lib/office-layout';

/* ── Camera Controller ──
   Smoothly lerps orbit target when a zone is selected. */
function CameraController({ activeZoneId }: { activeZoneId: string | null }) {
  const { camera } = useThree();
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  const defaultTarget = useMemo(() => new THREE.Vector3(0, 0, 0.5), []);
  const defaultCamPos = useMemo(() => new THREE.Vector3(0, 19, 14), []);

  const wantTarget = useRef(defaultTarget.clone());
  const wantCamPos = useRef(defaultCamPos.clone());

  useEffect(() => {
    if (activeZoneId) {
      const zone = OFFICE_ZONES.find((z) => z.id === activeZoneId);
      if (zone) {
        const [cx, , cz] = zone.center;
        wantTarget.current.set(cx, 0, cz);
        wantCamPos.current.set(cx, 13, cz + 9);
      }
    } else {
      wantTarget.current.copy(defaultTarget);
      wantCamPos.current.copy(defaultCamPos);
    }
  }, [activeZoneId, defaultTarget, defaultCamPos]);

  useFrame(() => {
    const ctrl = controlsRef.current as unknown as { target: THREE.Vector3 };
    if (!ctrl) return;
    ctrl.target.lerp(wantTarget.current, 0.045);
    camera.position.lerp(wantCamPos.current, 0.045);
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      minDistance={8}
      maxDistance={30}
      maxPolarAngle={Math.PI / 2.5}
      minPolarAngle={0.3}
      minAzimuthAngle={-Math.PI / 3.5}
      maxAzimuthAngle={Math.PI / 3.5}
      enableDamping
      dampingFactor={0.06}
    />
  );
}

function Scene({
  selectedAgentId,
  activeZoneId,
}: {
  selectedAgentId: string | null;
  activeZoneId: string | null;
}) {
  return (
    <FlagshipOfficeScene
      selectedAgentId={selectedAgentId}
      activeZoneId={activeZoneId}
    />
  );
}

export default function OfficeCanvas({
  selectedAgentId,
  activeZoneId,
}: {
  selectedAgentId: string | null;
  activeZoneId: string | null;
}) {
  return (
    <div className="absolute inset-0">
      <Canvas
        shadows="percentage"
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          toneMapping: 4,
          toneMappingExposure: 1.1,
        }}
      >
        {/* Isometric DJ-desk angle */}
        <PerspectiveCamera
          makeDefault
          position={[0, 19, 14]}
          fov={32}
          near={0.1}
          far={80}
        />
        <color attach="background" args={['#050710']} />
        <fog attach="fog" args={['#050710', 30, 52]} />

        {/* Clean ambient fill */}
        <ambientLight intensity={0.32} color="#d8dff0" />
        <hemisphereLight args={['#c0d0f0', '#080a14', 0.18]} />

        {/* Primary key light */}
        <directionalLight
          castShadow
          position={[8, 20, 6]}
          intensity={0.65}
          shadow-mapSize={[1024, 1024]}
          shadow-camera-far={50}
          shadow-camera-left={-16}
          shadow-camera-right={16}
          shadow-camera-top={16}
          shadow-camera-bottom={-16}
          shadow-bias={-0.0004}
          color="#e0dcd0"
        />
        {/* Subtle fill from opposite side */}
        <directionalLight
          position={[-6, 10, -4]}
          intensity={0.15}
          color="#8090c0"
        />

        <Suspense fallback={null}>
          <Scene
            selectedAgentId={selectedAgentId}
            activeZoneId={activeZoneId}
          />
        </Suspense>

        <CameraController activeZoneId={activeZoneId} />
      </Canvas>
    </div>
  );
}
