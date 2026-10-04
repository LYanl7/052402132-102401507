'use client';
import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { categories } from '../modules/message/constants.ts';
import { postInputSchema } from '../modules/message/schemas.ts';
import type { Post, PostInput } from '../modules/message/models.ts';
import { api, errorMessage } from '@/lib/api';
import { useSession } from './providers';
import { Loading, ErrorState } from './ui';
import { LocationPicker } from './location-picker';

const initial: PostInput = {
  type: 'lost',
  title: '',
  category: 'other',
  location: '',
  occurredAt: '',
  description: '',
  contact: '站内联系',
  images: [],
  lat: null,
  lng: null,
  coordinateSystem: 'bd09',
  status: 'active',
};
function localDate(value: string) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function PostForm() {
  const router = useRouter();
  const { toast } = useSession();
  const [form, setForm] = useState(initial),
    [time, setTime] = useState(''),
    [id, setId] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [loadError, setLoadError] = useState(''),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [tick, setTick] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const edit = new URLSearchParams(location.search).get('edit');
    setId(edit);
    if (!edit) {
      setLoading(false);
      return;
    }
    api<{ post: Post }>('/posts/' + edit)
      .then(({ post }) => {
        if (cancelled) return;
        setForm({ ...post, status: post.status === 'draft' ? 'draft' : 'active' });
        setTime(localDate(post.occurredAt));
      })
      .catch((e) => {
        if (!cancelled) setLoadError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);
  function update<K extends keyof PostInput>(key: K, value: PostInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  async function save(status: 'active' | 'draft') {
    setError('');
    setBusy(true);
    try {
      const payload = postInputSchema.parse({
        ...form,
        occurredAt: time ? new Date(time).toISOString() : '',
        status,
      });
      await api(id ? '/posts/' + id : '/posts', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      toast(status === 'draft' ? '草稿已保存' : '信息已发布');
      router.push(status === 'draft' ? '/my-posts?status=draft' : '/my-posts');
    } catch (e) {
      if (e && typeof e === 'object' && 'issues' in e)
        setError((e as { issues: { message: string }[] }).issues[0].message);
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!files) return;
    if (form.images.length + files.length > 9) {
      setError('最多上传 9 张照片');
      return;
    }
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) throw new Error('每张照片不能超过 5 MB');
        const data = new FormData();
        data.append('file', file);
        const result = await api<{ path: string }>('/uploads', { method: 'POST', body: data });
        setForm((f) => ({ ...f, images: [...f.images, result.path] }));
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }
  if (loading) return <Loading />;
  if (loadError)
    return (
      <ErrorState
        message={loadError}
        retry={() => {
          setLoadError('');
          setLoading(true);
          setTick((n) => n + 1);
        }}
      />
    );
  return (
    <form
      className="publish-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void save('active');
      }}
    >
      <h2 className="field-title">你要发布哪种信息？</h2>
      <div className="type-choice">
        {[
          ['lost', '寻物  我丢了东西'],
          ['found', '招领  我捡到东西'],
        ].map(([v, l]) => (
          <button
            type="button"
            key={v}
            className={form.type === v ? 'selected' : ''}
            onClick={() => update('type', v as PostInput['type'])}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="photo-heading">
        <h2>添加物品照片</h2>
        <span>清晰照片更容易被找到</span>
      </div>
      <div className="photo-list">
        {form.images.map((path) => (
          <div className="photo-preview" key={path}>
            <img src={path} alt="上传的物品照片" />
            <button
              type="button"
              aria-label="移除照片"
              onClick={() =>
                update(
                  'images',
                  form.images.filter((p) => p !== path),
                )
              }
            >
              <X size={15} />
            </button>
          </div>
        ))}
        {form.images.length < 9 && (
          <label className="photo-add">
            <Plus size={28} />
            <span>{uploading ? '上传中…' : '添加照片'}</span>
            <input
              type="file"
              aria-label="添加照片"
              accept="image/png,image/jpeg,image/webp"
              multiple
              disabled={uploading || busy}
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
      <p className="muted small">最多 9 张，每张 5 MB，避免展示证件完整号码</p>
      <div className="form-card">
        <label>
          <span>物品名称</span>
          <input
            aria-label="物品名称"
            placeholder="请输入物品名称"
            value={form.title}
            maxLength={60}
            onChange={(e) => update('title', e.target.value)}
          />
        </label>
        <label>
          <span>物品类别</span>
          <select
            aria-label="物品类别"
            value={form.category}
            onChange={(e) => update('category', e.target.value as PostInput['category'])}
          >
            {Object.entries(categories).map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{form.type === 'lost' ? '丢失' : '拾取'}地点</span>
          <input
            aria-label="地点"
            placeholder="请输入实际地点或在地图上选点"
            value={form.location}
            maxLength={120}
            onChange={(e) => {
              setForm((f) => ({
                ...f,
                location: e.target.value,
                lat: null,
                lng: null,
                coordinateSystem: 'bd09',
              }));
            }}
          />
        </label>
        <label>
          <span>{form.type === 'lost' ? '丢失' : '拾取'}时间</span>
          <input
            aria-label="发生时间"
            type="datetime-local"
            value={time}
            max={localDate(new Date().toISOString())}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <label className="textarea-label">
          <span>详细描述</span>
          <textarea
            aria-label="详细描述"
            placeholder="颜色、特征、经过等"
            rows={3}
            maxLength={2000}
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
          />
        </label>
        <label>
          <span>联系方式</span>
          <input
            aria-label="联系方式"
            placeholder="站内联系（推荐）"
            maxLength={120}
            value={form.contact}
            onChange={(e) => update('contact', e.target.value)}
          />
        </label>
      </div>
      <details
        className="coordinate-fields"
        onToggle={(event) => setPickerOpen(event.currentTarget.open)}
      >
        <summary>地图位置{form.lat !== null ? ' · 已设置' : '（自定义地点可选填）'}</summary>
        {form.coordinateSystem === 'legacy' && (
          <p className="form-error">旧地图位置尚未确认，请重新选点，让这条信息出现在附近。</p>
        )}
        {pickerOpen && (
          <LocationPicker
            value={
              form.coordinateSystem !== 'legacy' && form.lat !== null && form.lng !== null
                ? { lat: form.lat, lng: form.lng }
                : null
            }
            onChange={(position, address) =>
              setForm((previous) => {
                if (address && (previous.lat !== position.lat || previous.lng !== position.lng))
                  return previous;
                return {
                  ...previous,
                  ...position,
                  coordinateSystem: 'bd09',
                  location: previous.location || address || '',
                };
              })
            }
          />
        )}
        <p className="muted small">也可手动填写百度地图经纬度（BD-09）。</p>
        <label>
          纬度
          <input
            type="number"
            step="any"
            min={-90}
            max={90}
            aria-label="地图纬度"
            value={form.coordinateSystem === 'legacy' ? '' : (form.lat ?? '')}
            onChange={(e) =>
              setForm((previous) => ({
                ...previous,
                coordinateSystem: 'bd09',
                lng: previous.coordinateSystem === 'legacy' ? null : previous.lng,
                lat: e.target.value === '' ? null : Number(e.target.value),
              }))
            }
          />
        </label>
        <label>
          经度
          <input
            type="number"
            step="any"
            min={-180}
            max={180}
            aria-label="地图经度"
            value={form.coordinateSystem === 'legacy' ? '' : (form.lng ?? '')}
            onChange={(e) =>
              setForm((previous) => ({
                ...previous,
                coordinateSystem: 'bd09',
                lat: previous.coordinateSystem === 'legacy' ? null : previous.lat,
                lng: e.target.value === '' ? null : Number(e.target.value),
              }))
            }
          />
        </label>
        {form.lat !== null && (
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setForm((previous) => ({
                ...previous,
                lat: null,
                lng: null,
                coordinateSystem: 'bd09',
              }))
            }
          >
            清除地图位置
          </button>
        )}
      </details>
      <p className="muted small">
        温馨提示：
        {form.type === 'lost' ? '认领时请通过细节核验身份' : '交接前请让认领者描述物品特征'}
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="publish-actions">
        <button type="submit" disabled={busy || uploading} className="primary">
          {busy ? '正在保存…' : id ? '保存并发布' : '发布信息'}
        </button>
        <button
          type="button"
          disabled={busy || uploading}
          className="text-button"
          onClick={() => void save('draft')}
        >
          保存草稿
        </button>
      </div>
    </form>
  );
}
