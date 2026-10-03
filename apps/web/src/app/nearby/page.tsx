'use client';
import { useState } from 'react';
import { LocateFixed, Search } from 'lucide-react';
import { defaultMapCenter } from '@/modules/message/constants';
import type { Post } from '@/modules/message/models';
import { Frame, Header, PostRow, Loading, Empty, ErrorState } from '@/components/ui';
import { BaiduMap } from '@/components/baidu-map';
import { useResource, useSession } from '@/components/providers';
import { locateOnBaiduMap, type MapPosition } from '@/lib/baidu-map';

export default function NearbyPage() {
  const [center, setCenter] = useState<MapPosition>(defaultMapCenter);
  const [viewport, setViewport] = useState<MapPosition>(defaultMapCenter);
  const [position, setPosition] = useState<MapPosition | null>(null);
  const [source, setSource] = useState('默认浏览位置');
  const [locating, setLocating] = useState(false);
  const [type, setType] = useState('');
  const [radius, setRadius] = useState('1500');
  const { toast } = useSession();
  const result = useResource<{ items: Post[]; total: number }>(
    `/posts/nearby?lat=${center.lat}&lng=${center.lng}&radius=${radius}${type ? '&type=' + type : ''}`,
  );
  async function locate() {
    setLocating(true);
    try {
      const value = await locateOnBaiduMap();
      setCenter(value);
      setViewport(value);
      setPosition(value);
      setSource('当前位置');
      toast('已更新当前位置');
    } catch (error) {
      toast(error instanceof Error ? error.message : '暂时无法定位，请在地图上选择位置');
    } finally {
      setLocating(false);
    }
  }
  const moved = Math.abs(viewport.lat - center.lat) + Math.abs(viewport.lng - center.lng) > 0.0001;
  return (
    <Frame>
      <Header
        title="附近"
        action={
          <select
            aria-label="附近范围"
            value={radius}
            onChange={(event) => setRadius(event.target.value)}
          >
            <option value="500">500 m</option>
            <option value="1500">1.5 km</option>
            <option value="3000">3 km</option>
            <option value="5000">5 km</option>
          </select>
        }
      />
      <BaiduMap
        center={center}
        radius={Number(radius)}
        position={position}
        posts={result.loading || result.error ? [] : result.data?.items}
        onMove={setViewport}
      >
        <div className="map-filters">
          {[
            ['lost', '寻物'],
            ['found', '招领'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`${value} ${type === value ? 'selected' : ''}`}
              aria-pressed={type === value}
              onClick={() => setType(type === value ? '' : value)}
            >
              <i />
              {label}
            </button>
          ))}
        </div>
        {moved && (
          <button
            className="map-search-area"
            onClick={() => {
              setCenter(viewport);
              setSource('地图选定位置');
            }}
          >
            <Search size={15} />
            搜索此区域
          </button>
        )}
        <button
          className="locate-button"
          aria-label="获取当前位置"
          disabled={locating}
          onClick={() => void locate()}
        >
          <LocateFixed size={22} />
        </button>
        <span className="map-caption">{locating ? '正在定位…' : '拖动地图，发现周边失物'}</span>
      </BaiduMap>
      <section className="nearby-panel">
        <div className="panel-handle" />
        <div className="results-heading">
          <h2>附近动态</h2>
          <span>{result.loading ? '加载中…' : `${result.data?.total ?? 0} 条`}</span>
        </div>
        <p className="muted small">
          {source}周边 · 按直线距离排序
          {!position && ' · 点击定位查看身边的信息'}
        </p>
        {result.loading ? (
          <Loading />
        ) : result.error ? (
          <ErrorState message={result.error} retry={result.reload} />
        ) : result.data?.items.length ? (
          result.data.items.map((post) => <PostRow key={post.id} post={post} />)
        ) : (
          <Empty text="当前范围暂无信息，试试扩大范围或移动地图" />
        )}
      </section>
    </Frame>
  );
}
