'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Line } from '@react-three/drei';

interface DataFlowLinesProps {
  edges: [THREE.Vector3, THREE.Vector3][];
  color?: string;
  activeZoneId?: string | null;
}

function SignalPulse({
  curve,
  color,
  offset,
}: {
  curve: THREE.CatmullRomCurve3;
  color: string;
  offset: number;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (clock.elapsedTime * 0.1 + offset) % 1;
    const p = curve.getPointAt(t);
    ref.current.position.copy(p);
    const s = 0.1 + Math.sin(clock.elapsedTime * 3 + offset * 8) * 0.03;
    ref.current.scale.setScalar(s);
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.1, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.65} toneMapped={false} />
    </mesh>
  );
}

export default function DataFlowLines({
  edges,
  color = '#6366f1',
}: DataFlowLinesProps) {
  const curves = useMemo(() => {
    return edges.map(([a, b]) => {
      const start = a.clone();
      const end = b.clone();
      start.y = 0.06;
      end.y = 0.06;

      const mid = start.clone().lerp(end, 0.5);
      mid.y = 0.12;
      const sideways = new THREE.Vector3(end.z - start.z, 0, -(end.x - start.x))
        .normalize()
        .multiplyScalar(0.5);
      mid.add(sideways);

      return new THREE.CatmullRomCurve3([start, mid, end]);
    });
  }, [edges]);

  return (
    <group>
      {curves.map((curve, i) => {
        const pts = curve.getPoints(28);
        return (
          <group key={i}>
            <Line
              points={pts}
              color={color}
              transparent
              opacity={0.1}
              lineWidth={1.2}
              dashed={false}
            />
            <SignalPulse curve={curve} color={color} offset={i * 0.22} />
            <SignalPulse curve={curve} color="#a5b4fc" offset={i * 0.22 + 0.5} />
          </group>
        );
      })}
    </group>
  );
}
