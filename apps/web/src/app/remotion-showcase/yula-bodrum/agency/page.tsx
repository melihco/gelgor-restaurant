import { redirect } from 'next/navigation';

/** Kısa link: /remotion-showcase/yula-bodrum/agency */
export default function YulaBodrumAgencyShowcaseRedirect() {
  redirect('/remotion-showcase?collection=Agency&preset=yula_bodrum');
}
