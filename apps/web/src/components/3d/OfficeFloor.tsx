'use client';

import * as THREE from 'three';
import { OFFICE_ZONES } from '@/lib/office-layout';

export default function OfficeFloor() {
  return (
    <group>
      {/* ── Console faceplate ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0.5]} receiveShadow>
        <planeGeometry args={[26, 16]} />
        <meshPhysicalMaterial
          color="#0b0e18"
          roughness={0.22}
          metalness={0.15}
          clearcoat={0.7}
          clearcoatRoughness={0.12}
        />
      </mesh>

      {/* Infinite dark backdrop */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0.5]}>
        <planeGeometry args={[60, 50]} />
        <meshBasicMaterial color="#030508" />
      </mesh>

      {/* ── Per-zone deck plates ── */}
      {OFFICE_ZONES.map((z) => {
        const [cx, , cz] = z.center;
        const [w, d] = z.size;
        return (
          <group key={z.id}>
            {/* Recessed zone surface */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.005, cz]} receiveShadow>
              <planeGeometry args={[w - 0.4, d - 0.4]} />
              <meshPhysicalMaterial
                color="#070a14"
                roughness={0.28}
                metalness={0.18}
                clearcoat={0.5}
                clearcoatRoughness={0.2}
              />
            </mesh>

            {/* Zone border edges — horizontal */}
            {([-1, 1] as const).map((sign, i) => (
              <mesh key={`h-${i}`} position={[cx, 0.01, cz + sign * (d / 2 - 0.2)]}>
                <boxGeometry args={[w - 0.4, 0.005, 0.025]} />
                <meshStandardMaterial
                  color={z.accent}
                  emissive={z.accent}
                  emissiveIntensity={0.5}
                  transparent
                  opacity={0.4}
                  toneMapped={false}
                />
              </mesh>
            ))}
            {/* Zone border edges — vertical */}
            {([-1, 1] as const).map((sign, i) => (
              <mesh key={`v-${i}`} position={[cx + sign * (w / 2 - 0.2), 0.01, cz]}>
                <boxGeometry args={[0.025, 0.005, d - 0.4]} />
                <meshStandardMaterial
                  color={z.accent}
                  emissive={z.accent}
                  emissiveIntensity={0.5}
                  transparent
                  opacity={0.4}
                  toneMapped={false}
                />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* ── Crossfader groove (row divider) ── */}
      <mesh position={[0, 0.008, 0.5]}>
        <boxGeometry args={[22, 0.004, 0.06]} />
        <meshStandardMaterial
          color="#fbbf24"
          emissive="#fbbf24"
          emissiveIntensity={0.25}
          transparent
          opacity={0.2}
          toneMapped={false}
        />
      </mesh>
      {/* Crossfader slider knob */}
      <mesh position={[0, 0.015, 0.5]}>
        <boxGeometry args={[0.6, 0.02, 0.15]} />
        <meshPhysicalMaterial color="#2a2e3a" roughness={0.2} metalness={0.6} clearcoat={0.4} />
      </mesh>

      {/* ── Column dividers ── */}
      {([-4.75, 4.75] as const).map((x, i) => (
        <mesh key={`col-${i}`} position={[x, 0.008, 0.5]}>
          <boxGeometry args={[0.03, 0.004, 12]} />
          <meshStandardMaterial
            color="#3a4060"
            emissive="#3a4060"
            emissiveIntensity={0.15}
            transparent
            opacity={0.3}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* ── Subtle grid dot pattern ── */}
      {Array.from({ length: 12 }).map((_, xi) =>
        Array.from({ length: 8 }).map((_, zi) => {
          const x = -11 + xi * 2;
          const z = -4.5 + zi * 1.5;
          return (
            <mesh
              key={`dot-${xi}-${zi}`}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[x, -0.015, z]}
            >
              <circleGeometry args={[0.025, 6]} />
              <meshBasicMaterial
                color="#181c2a"
                transparent
                opacity={0.5}
                depthWrite={false}
              />
            </mesh>
          );
        }),
      )}

      {/* ── Decorative fader tracks per zone ── */}
      {OFFICE_ZONES.map((z) => {
        const [cx, , cz] = z.center;
        const [w] = z.size;
        return (
          <group key={`fader-${z.id}`}>
            {/* Fader groove */}
            <mesh position={[cx + w / 2 - 0.4, 0.008, cz]}>
              <boxGeometry args={[0.04, 0.003, 1.8]} />
              <meshStandardMaterial color="#1e2230" roughness={0.3} metalness={0.5} />
            </mesh>
            {/* Fader knob */}
            <mesh position={[cx + w / 2 - 0.4, 0.015, cz - 0.2]}>
              <boxGeometry args={[0.12, 0.015, 0.2]} />
              <meshPhysicalMaterial color="#2a2e3a" roughness={0.2} metalness={0.6} clearcoat={0.3} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
