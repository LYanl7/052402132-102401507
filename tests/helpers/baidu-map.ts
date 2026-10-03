import type { Page } from '@playwright/test';

// Replace the external SDK only: queries, persistence and app navigation stay real.
export async function mockBaiduMap(page: Page) {
  await page.route('https://api.map.baidu.com/api?*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `(() => {
      class Point { constructor(lng, lat) { this.lng = lng; this.lat = lat; } }
      class Size { constructor(width, height) { this.width = width; this.height = height; } }
      class Label { constructor(content, options) { this.content = content; this.options = options; } }
      class Circle { constructor(point, radius) { this.point = point; this.radius = radius; } }
      class Map {
        constructor(element) {
          this.element = element; this.events = {}; this.overlays = [];
          element.style.background = '#e8ede4';
          element.addEventListener('click', this.click = (event) => {
            if (event.target.closest('a')) return;
            this.emit('click', { point: new Point(this.center.lng + 0.001, this.center.lat + 0.001) });
          });
          window.__testMap = this;
        }
        emit(event, data = {}) { for (const handler of this.events[event] || []) handler(data); }
        centerAndZoom(point) { this.center = point; queueMicrotask(() => this.emit('tilesloaded')); }
        panTo(point) { this.center = point; this.draw(); }
        getCenter() { return this.center; }
        enableScrollWheelZoom() {}
        addEventListener(event, handler) { (this.events[event] ||= []).push(handler); }
        removeEventListener(event, handler) { this.events[event] = (this.events[event] || []).filter(value => value !== handler); }
        addOverlay(overlay) {
          this.overlays.push(overlay);
          if (overlay.content) {
            overlay.element = document.createElement('div');
            overlay.element.innerHTML = overlay.content;
            overlay.element.style.position = 'absolute';
            this.element.appendChild(overlay.element);
          }
          this.draw();
        }
        draw() { for (const overlay of this.overlays) if (overlay.element) {
          overlay.element.style.left = (this.element.clientWidth / 2 + (overlay.options.position.lng - this.center.lng) * 15000 + overlay.options.offset.width) + 'px';
          overlay.element.style.top = (this.element.clientHeight / 2 - (overlay.options.position.lat - this.center.lat) * 15000 + overlay.options.offset.height) + 'px';
        } }
        removeOverlay(overlay) { overlay.element?.remove(); this.overlays = this.overlays.filter(value => value !== overlay); }
        destroy() { this.element.removeEventListener('click', this.click); this.element.replaceChildren(); }
      }
      class Convertor { translate(points, from, to, callback) {
        window.__testConversion = { from, to };
        callback({ status: window.__testConversionFailure ? 1 : 0,
          points: points.map(point => new Point(point.lng + 0.006, point.lat + 0.006)) });
      } }
      class Geocoder {
        getPoint(address, callback) { callback(address === '不存在的地点' ? null : new Point(119.1978, 26.0585)); }
        getLocation(point, callback) { callback({ address: '测试城市测试学校图书馆' }); }
      }
      window.BMap = { Map, Point, Size, Label, Circle, Convertor, Geocoder };
      window.__mayoimonBaiduReady();
    })();`,
    }),
  );
}
