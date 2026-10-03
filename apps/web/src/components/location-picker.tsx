'use client';
import { useEffect, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { BaiduMap } from './baidu-map';
import { defaultMapCenter } from '@/modules/message/constants';
import {
  describeMapPosition,
  findMapAddress,
  locateOnBaiduMap,
  type MapPosition,
} from '@/lib/baidu-map';

export function LocationPicker({
  value,
  onChange,
}: {
  value: MapPosition | null;
  onChange: (position: MapPosition, address?: string) => void;
}) {
  const [center, setCenter] = useState(value ?? defaultMapCenter);
  const [city, setCity] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current += 1;
    },
    [],
  );
  async function pick(position: MapPosition) {
    const current = ++sequence.current;
    setError('');
    onChange(position);
    const address = await describeMapPosition(position).catch(() => '');
    if (sequence.current === current && address) onChange(position, address);
  }
  async function search(locate = false) {
    if (!locate && !query.trim()) {
      setError('请输入要搜索的地点');
      return;
    }
    const current = ++sequence.current;
    setBusy(true);
    setError('');
    try {
      const position = locate
        ? await locateOnBaiduMap()
        : await findMapAddress(query.trim(), city.trim());
      if (current !== sequence.current) return;
      setCenter(position);
      await pick(position);
    } catch (failure) {
      if (current === sequence.current)
        setError(failure instanceof Error ? failure.message : '无法获取位置，请重试');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="location-picker">
      <p className="muted small">搜索地点或点击地图，标记丢失 / 拾取位置。</p>
      <div className="location-search">
        <input
          aria-label="地点所在城市"
          placeholder="城市"
          value={city}
          onChange={(event) => setCity(event.target.value)}
        />
        <input
          aria-label="搜索地图地点"
          placeholder="学校、建筑或街道"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (!busy) void search();
            }
          }}
        />
        <button type="button" disabled={busy} onClick={() => void search()}>
          搜索
        </button>
      </div>
      <BaiduMap
        center={center}
        position={value}
        onPick={(position) => void pick(position)}
        className="picker-map"
      >
        <button
          type="button"
          className="locate-button"
          aria-label="使用当前位置作为发布地点"
          disabled={busy}
          onClick={() => void search(true)}
        >
          <LocateFixed size={22} />
        </button>
      </BaiduMap>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="muted small">
          正在获取位置…
        </p>
      )}
      <p className="muted small">
        {value ? '已标记位置，可继续点击地图调整' : '尚未标记，未设置位置的信息不会出现在附近'}
      </p>
    </div>
  );
}
