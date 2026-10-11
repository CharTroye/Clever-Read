import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeEndpoint, normalizeModelName } from './public/core.mjs';

const scripts = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scripts');
export function runPowerShell(script, args = [], input = '', timeout = 15000, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('已取消导入。'), { name: 'AbortError' }));
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const output = [], errors = [];
    let timedOut = false, aborted = false, progressBuffer = '';
    const cancel = () => { aborted = true; child.kill(); };
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    child.stdout.on('data', chunk => {
      output.push(chunk);
      if (!onProgress) return;
      progressBuffer += chunk.toString('utf8');
      let end;
      while ((end = progressBuffer.indexOf('\n')) >= 0) {
        const line = progressBuffer.slice(0, end).trim(); progressBuffer = progressBuffer.slice(end + 1);
        if (line.startsWith('CLEVER_PROGRESS:')) { try { onProgress(JSON.parse(line.slice(16))); } catch {} }
      }
    });
    child.stderr.on('data', chunk => errors.push(chunk));
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', code => {
      cleanup();
      if (aborted) return reject(Object.assign(new Error('已取消导入。'), { name: 'AbortError' }));
      if (timedOut) return reject(new Error('本机处理超时，请重试。'));
      code === 0 ? resolve(Buffer.concat(output).toString('utf8').replace(/^\uFEFF/, '').trim()) : reject(new Error(Buffer.concat(errors).toString('utf8').trim() || '本机处理失败。'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

function publicProfile(profile) {
  return { id: profile.id, name: profile.name, model: profile.model, endpoint: profile.endpoint, vision: profile.vision, hasKey: !!profile.apiKey, updatedAt: profile.updatedAt };
}

export class ModelVault {
  constructor(directory, options = {}) {
    this.directory = directory;
    this.filename = path.join(directory, 'model-vault.json');
    this.platform = options.platform || process.platform;
    this.queue = Promise.resolve();
  }
  async aesKey() {
    const filename = path.join(this.directory, 'vault.key');
    try { return await readFile(filename); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const key = randomBytes(32);
      try { await writeFile(filename, key, { flag: 'wx', mode: 0o600 }); return key; }
      catch (error) { if (error.code === 'EEXIST') return readFile(filename); throw error; }
    }
  }
  async protect(value) {
    if (this.platform === 'win32') return { protection: 'windows-dpapi', data: await runPowerShell(path.join(scripts, 'protect-vault.ps1'), ['-Mode', 'protect'], value) };
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', await this.aesKey(), nonce);
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return { protection: 'local-aes-gcm', nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
  }
  async unprotect(envelope) {
    if (envelope.protection === 'windows-dpapi' && this.platform === 'win32') return runPowerShell(path.join(scripts, 'protect-vault.ps1'), ['-Mode', 'unprotect'], envelope.data);
    if (envelope.protection !== 'local-aes-gcm' || this.platform === 'win32') throw new Error('此密钥库属于另一台电脑或 Windows 账户。');
    const decipher = createDecipheriv('aes-256-gcm', await this.aesKey(), Buffer.from(envelope.nonce, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8');
  }
  async read() {
    if (this.state) return this.state;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let raw;
    try { raw = await readFile(this.filename, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return this.state = { version: 1, activeId: '', profiles: [] }; throw error; }
    try {
      const state = JSON.parse(await this.unprotect(JSON.parse(raw)));
      if (state.version !== 1 || !Array.isArray(state.profiles)) throw new Error();
      return this.state = state;
    } catch { throw new Error('无法打开密钥库，请使用保存密钥时的 Windows 账户；原库不会被覆盖。'); }
  }
  async change(update) {
    const operation = this.queue.then(async () => {
      const state = structuredClone(await this.read());
      update(state);
      const envelope = await this.protect(JSON.stringify(state));
      const temporary = this.filename + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, JSON.stringify({ version: 1, ...envelope }), { mode: 0o600 });
      await rename(temporary, this.filename);
      this.state = state;
      return this.list();
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  async list() {
    const state = await this.read();
    return { activeId: state.activeId, profiles: state.profiles.map(publicProfile), protection: this.platform === 'win32' ? 'windows-dpapi' : 'local-aes-gcm' };
  }
  async save(input) {
    const endpoint = normalizeEndpoint(input.endpoint);
    const model = normalizeModelName(input.model, endpoint);
    const name = String(input.name || input.model || '').trim().slice(0, 120);
    if (!model || model.length > 160 || !name) throw new Error('请填写模型名称。');
    const key = String(input.apiKey || '').trim();
    if (key.length > 2000 || /[\r\n]/.test(key)) throw new Error('密钥格式不正确。');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(endpoint).hostname);
    return this.change(state => {
      const previous = input.id ? state.profiles.find(profile => profile.id === input.id) : null;
      if (input.id && !previous) throw new Error('该模型配置已被移除，请新增配置。');
      if (previous?.apiKey && previous.endpoint !== endpoint && !key) throw new Error('更换接口地址时，请重新输入对应的 API Key。');
      const apiKey = key || previous?.apiKey || '';
      if (!local && !apiKey) throw new Error('请填写 API Key；保存后再次编辑可留空保留原密钥。');
      if (!previous && state.profiles.length >= 50) throw new Error('最多保存 50 组模型配置。');
      const profile = { id: previous?.id || randomUUID(), name, endpoint, model, apiKey, vision: input.vision === true, updatedAt: Date.now() };
      state.profiles = [profile, ...state.profiles.filter(item => item.id !== profile.id)];
      state.activeId = profile.id;
    });
  }
  async activate(id) { return this.change(state => { if (!state.profiles.some(profile => profile.id === id)) throw new Error('模型配置不存在。'); state.activeId = id; }); }
  async remove(id) { return this.change(state => { if (!state.profiles.some(profile => profile.id === id)) throw new Error('模型配置不存在。'); state.profiles = state.profiles.filter(profile => profile.id !== id); if (state.activeId === id) state.activeId = ''; }); }
  async credentials(id) {
    const state = await this.read();
    const profile = state.profiles.find(profile => profile.id === id);
    if (!profile) throw new Error('保存的模型配置不存在，请重新选择。');
    return { ...profile };
  }
}
