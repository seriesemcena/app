import { Frame } from '@/components/Frame';
import { PageLoadingState } from '@/components/AppStates';

export default function Loading() {
  return <Frame><PageLoadingState /></Frame>;
}
