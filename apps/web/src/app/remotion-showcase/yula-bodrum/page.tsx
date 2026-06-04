import { redirect } from 'next/navigation';

/** Kısa link: /remotion-showcase/yula-bodrum */
export default function YulaBodrumShowcaseRedirect() {
  redirect('/remotion-showcase?preset=yula_bodrum');
}
