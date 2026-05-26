'use client';

import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { OFFICE_ZONES } from '@/lib/office-layout';

export default function OfficeArchitecture({
  activeZoneId,
}: {
  activeZoneId: string | null;
}) {
  return (
    <group>
      {OFFICE_ZONES.map((z) => {
        const isActive = activeZoneId === z.id;
        const [cx, , cz] = z.center;
        const [w, d] = z.size;

        return (
          <group key={z.id}>
            {/* Active-zone highlight fill */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.012, cz]}>
              <planeGeometry args={[w - 0.5, d - 0.5]} />
              <meshStandardMaterial
                color={z.accent}
                emissive={z.accent}
                emissiveIntensity={isActive ? 0.18 : 0.02}
                transparent
                opacity={isActive ? 0.1 : 0.012}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
              />
            </mesh>

            {/* Corner LED markers */}
            {([
              [-w / 2 + 0.3, -d / 2 + 0.3],
              [w / 2 - 0.3, -d / 2 + 0.3],
              [-w / 2 + 0.3, d / 2 - 0.3],
              [w / 2 - 0.3, d / 2 - 0.3],
            ] as [number, number][]).map(([dx, dz], i) => (
              <mesh key={i} position={[cx + dx, 0.013, cz + dz]}>
                <boxGeometry args={[0.1, 0.008, 0.1]} />
                <meshStandardMaterial
                  color={z.accent}
                  emissive={z.accent}
                  emissiveIntensity={isActive ? 0.9 : 0.3}
                  transparent
                  opacity={isActive ? 0.9 : 0.35}
                  toneMapped={false}
                />
              </mesh>
            ))}

            {/* Zone name label */}
            <Text
              position={[cx - w / 2 + 0.45, 0.018, cz - d / 2 + 0.4]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.26}
              color={z.accent}
              anchorX="left"
              anchorY="bottom"
              fillOpacity={isActive ? 0.95 : 0.5}
            >
              {z.name}
            </Text>
            {/* Zone subtitle */}
            <Text
              position={[cx - w / 2 + 0.45, 0.018, cz - d / 2 + 0.75]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.12}
              color="#6b7280"
              anchorX="left"
              anchorY="bottom"
              fillOpacity={isActive ? 0.65 : 0.3}
            >
              {z.subtitle}
            </Text>
          </group>
        );
      })}

      {/* ── Brand watermark ── */}
      <Text
        position={[0, 0.014, -6.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.5}
        color="#e0e4f0"
        anchorX="center"
        anchorY="middle"
        fillOpacity={0.04}
      >
        Smart Agency OS
      </Text>
    </group>
  );
}
