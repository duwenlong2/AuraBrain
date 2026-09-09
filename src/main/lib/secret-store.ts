import keytar from 'keytar'

const SERVICE_NAME = 'AuraBrain'

function validateKey(key: string): string {
  const normalizedKey = key.trim()
  if (!normalizedKey) throw new Error('安全存储 key 不能为空')
  return normalizedKey
}

export async function setSecret(key: string, value: string): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, validateKey(key), value)
}

export async function getSecret(key: string): Promise<string | null> {
  return keytar.getPassword(SERVICE_NAME, validateKey(key))
}

export async function deleteSecret(key: string): Promise<void> {
  await keytar.deletePassword(SERVICE_NAME, validateKey(key))
}