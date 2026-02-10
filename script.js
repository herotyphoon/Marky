async function compress(text) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);

    const stream = new CompressionStream('deflate-raw');

    const writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();

    const buffer = await new Response(stream.readable).arrayBuffer();

    const compressedText = new Uint8Array(buffer).toBase64({ alphabet: 'base64url' });
    return compressedText;
}

async function decompress(compressedText) {
    if (!compressedText) return ''; 

    const bytes = Uint8Array.fromBase64(compressedText, { alphabet: 'base64url' });

    const stream = new DecompressionStream('deflate-raw');

    const writer = stream.writable.getWriter();
    writer.write(bytes); 
    writer.close();

    const buffer = await new Response(stream.readable).arrayBuffer();

    const text = new TextDecoder().decode(buffer);
    return text;
}

async function set(hash) {
    const content = await decompress(hash.slice(1));

    editor.textContent = content
}

async function get() {
    const content = editor.textContent;

    const hash = '#' + await compress(content);
    return hash;
}

async function save() {
    const hash = await get();

    if (location.hash !== hash) {
        history.replaceState({}, '', hash);
        try {
            localStorage.setItem('hash', hash);
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
        }
    }
}

async function load() {
    try {
        if (!location.hash || location.hash === '#') {
            
            if (editor.textContent) {
                history.replaceState({}, '', await get());
                return;
            }

            const storedHash = localStorage.getItem('hash');
            
            if (storedHash) {
                await set(storedHash);
                location.hash = storedHash;
            } else {
                editor.textContent = '';
            }
            return;
        }

        await set(location.hash);
    } catch (e) {
        console.error("Load failed:", e);
        editor.textContent = '';
        history.replaceState({}, '', ' '); 
    }
}

function debounce(ms, func) {
    let timer;

    const debouncedFunc = (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => func(...args), ms)
    }
    return debouncedFunc;
}

const editor = document.querySelector('.editor');
editor.addEventListener('input', debounce(500, save));
addEventListener('DOMContentLoaded', load);
addEventListener('hashchange', load);