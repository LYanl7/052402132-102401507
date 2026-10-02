'use client';
import { Frame, Header, AuthGate } from '@/components/ui';
import { PostForm } from '@/components/post-form';
export default function PublishPage() {
  return (
    <Frame nav={false}>
      <Header title="发布信息" back />
      <AuthGate>
        <PostForm />
      </AuthGate>
    </Frame>
  );
}
