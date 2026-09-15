import { Bonjour, type Service } from 'bonjour-service'

const service = new Bonjour()
let published: Service | null = null

export function startNativeRuntimeDiscovery(port: number): void {
  if (published) return
  published = service.publish({
    name: 'AuraBrain Runtime',
    type: 'aurabrain',
    port,
    txt: { protocol: '1', register: '/v1/native-devices/register', poll: '/v1/native-devices' },
  })
}

export function stopNativeRuntimeDiscovery(): void {
  if (!published) return
  service.unpublishAll(() => service.destroy())
  published = null
}