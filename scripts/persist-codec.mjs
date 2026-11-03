// Decoder for Motion Twin's PersistCodec/BitCodec wire format.
// Reference: github.com/motion-twin/mtypes/blob/master/lib/PersistCodec.mt
const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';

export function decodePersist(data) {
  let pos = 0;
  const fields = [];
  let fieldBits = 0;
  let nextField = 1;
  function read(n) {
    let value = 0;
    for (let i = 0; i < n; i++) {
      const char = alphabet.indexOf(data[Math.floor(pos / 6)] ?? '!');
      if (char < 0) throw new Error(`Invalid/truncated PersistCodec at bit ${pos}`);
      value = value * 2 + ((char >> (5 - pos % 6)) & 1);
      pos++;
    }
    return value;
  }
  function integer() {
    const n = read(2);
    if (n < 3) return read((n + 1) * 2);
    if (read(1)) return -integer();
    if (!read(1)) return read(16);
    return read(16) | (read(16) << 16);
  }
  function string() {
    const length = integer();
    if (length < 0 || length > data.length * 8) throw new Error('Invalid string length');
    const b64 = read(1) === 0;
    const bits = b64 ? 6 : (read(1) === 0 ? 7 : 8);
    return Array.from({ length }, () => b64 ? alphabet[read(bits)] : String.fromCharCode(read(bits))).join('');
  }
  function value(depth = 0) {
    if (depth > 100) throw new Error('PersistCodec nesting limit');
    if (read(1) === 0) {
      if (read(1) === 0) return integer();
      if (read(1) === 1) {
        if (read(1) === 0) return NaN;
        return read(1) ? -Infinity : Infinity;
      }
      return Number(Array.from({ length: read(5) }, () => '0123456789.+-e'[read(4)]).join(''));
    }
    if (read(1) === 0) {
      if (read(1) === 0) {
        const out = [];
        let index = 0;
        while (true) {
          if (read(1) === 0) out[index++] = value(depth + 1);
          else if (read(1)) return out;
          else index += integer();
          if (index > 100000) throw new Error('PersistCodec array limit');
        }
      }
      const out = Object.create(null);
      while (true) {
        let key;
        if (read(1) === 0) {
          key = fields[read(fieldBits)];
          if (key === undefined) throw new Error('Invalid field reference');
        } else {
          if (read(1)) return out;
          key = string();
          fields.push(key);
          if (fields.length >= nextField) { fieldBits++; nextField *= 2; }
        }
        out[key] = value(depth + 1);
      }
    }
    const flag = read(2);
    return flag === 0 ? false : flag === 1 ? true : flag === 2 ? string() : null;
  }
  return value();
}
