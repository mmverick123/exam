const script = process.argv[2];

if (!script || !/^[\w-]+\.acceptance\.ts$/.test(script)) {
  throw new Error('请指定 acceptance 脚本文件名');
}

process.env.NODE_ENV = 'test';
await import(`./${script}`);
