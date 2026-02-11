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

    if (currentFileHandle) return;

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
        let content = '';
        let fileRestored = false;

        if (supportsFileSystemAccess) {
            const savedHandle = await getSavedHandle();

            if (savedHandle) {
                const hasPermission = await verifyPermission(savedHandle);

                if (hasPermission) {
                    currentFileHandle = savedHandle;
                    updateFileName(savedHandle.name);

                    const file = await savedHandle.getFile();
                    content = await file.text();

                    fileRestored = true;
                }
            }
        }

        if (!fileRestored) {
            if (location.hash && location.hash.length > 1) {
                content = await decompress(location.hash.slice(1));
            } else {
                const storedHash = localStorage.getItem('hash');
                if (storedHash) {
                    content = await decompress(storedHash.slice(1));
                }
            }
        }

        if (content) {
            editor.textContent = content;
            lastSavedContent = content;
            markDirty(false);

            const tokens = tokenizer(content);
            preview.innerHTML = parser(tokens);
            updatePageTitleFromTokens(tokens);
        }

    } catch (e) {
        console.error("Load failed:", e);
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

function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function normalizeURL(url) {
    let trimmed = url.trim();

    if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) {
        return trimmed;
    }

    if (/^\/\//.test(trimmed)) {
        return 'https:' + trimmed;
    }

    return 'https://' + trimmed;
}

function inLineParser(line) {
    let result = escapeHTML(line);

    const escapes = [];
    result = result.replace(/\\(.)/g, (m, char) => {
        escapes.push(char);
        return `%%ESC${escapes.length - 1}%%`;
    });

    result = result.replace(
        /(^|\s)((https?:\/\/|www\.)[^\s<]+)/g,
        (m, prefix, url) => {
            const href = normalizeURL(url);
            return `${prefix}<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
        }
    );    

    result = result.replace(/!\[(.*?)\]\((.*?)\)/g, (m, alt, src) => {
        return `<img src="${src}" alt="${alt}" />`;
    });    
    result = result.replace(/\[(.+?)\]\((.+?)\)/g, (m, text, url) => {
        const safeURL = normalizeURL(url);
        return `<a href="${safeURL}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });    

    result = result.replace(/~~(.+?)~~/g, (m,c)=>`<del>${c}</del>`);
    result = result.replace(/__(.+?)__/g, (m,c)=>`<u>${c}</u>`);

    result = result.replace(/\*\*(.+?)\*\*/g, (m,c)=>`<strong>${c}</strong>`);
    result = result.replace(/\*(.+?)\*/g, (m,c)=>`<em>${c}</em>`);

    result = result.replace(/`(.+?)`/g, (m,c)=>`<code>${c}</code>`);

    result = result.replace(/%%ESC(\d+)%%/g, (m, i) => escapes[i]);

    result = result.replace(/\n/g, '<br>');

    return result;
}

function tokenizer(text) {
    const lines = text.split('\n');
    const tokens = [];
    let paragraphBuffer = [];
    let i = 0;

    const cont = { state:false, type:'', endOn:'', value:null };

    function flushParagraph() {
        if (paragraphBuffer.length) {
            tokens.push({
                type: 'p',
                content: paragraphBuffer.join('\n')
            });
            paragraphBuffer = [];
        }
    }

    function indentLevel(line) {
        const indent = line.match(/^\s*/)[0];
        return indent.replace(/\t/g, '    ').length;
    }

    function parseNestedList(startIndent) {
        const items = [];

        while (i < lines.length) {
            const raw = lines[i];
            const indent = indentLevel(raw);
            const line = raw.trimLeft();

            if (indent < startIndent) break;

            const matchUL = line.match(/^[-+]\s+(.*)/);
            const matchOL = line.match(/^(\d+)\.\s+(.*)/);

            if (!matchUL && !matchOL) break;

            const content = matchUL ? matchUL[1] : matchOL[2];

            i++;

            let children = [];
            if (i < lines.length && indentLevel(lines[i]) >= indent + 4) {
                children = parseNestedList(indentLevel(lines[i]));
            }

            items.push({ content, children });
        }

        return [{
            type: 'list',
            ordered: /^\s*\d+\./.test(lines[i-1]),
            items
        }];
    }

    function parseNestedBlockquote() {
        const collected = [];

        while (i < lines.length && lines[i].trimLeft().startsWith('>')) {
            const line = lines[i].replace(/^\s*>+\s?/, '');
            collected.push(line);
            i++;
        }

        return {
            type:'blockquote',
            content: tokenizer(collected.join('\n'))
        };
    }

    while (i < lines.length) {
        let rawLine = lines[i];
        let line = rawLine.trimLeft();

        if (cont.state && cont.type === 'codeblock') {
            if (line.startsWith(cont.endOn)) {
                tokens.push(cont.value);
                cont.state = false;
                cont.value = null;
            } else {
                cont.value.content += line + '\n';
            }
            i++;
            continue;
        }

        if (line.startsWith('```')) {
            flushParagraph();
            cont.state = true;
            cont.type = 'codeblock';
            cont.endOn = '```';
            cont.value = { type:'codeblock', lang:line.slice(3).trim(), content:'' };
            i++;
            continue;
        }

        if (
            i + 1 < lines.length &&
            line.includes('|') &&
            /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[i + 1])
        ) {
            flushParagraph();
        
            const headerLine = lines[i];
            const alignLine = lines[i + 1];
            i += 2;
        
            const rows = [];
        
            while (i < lines.length && lines[i].includes('|')) {
                rows.push(lines[i]);
                i++;
            }
        
            tokens.push({
                type: 'table',
                header: headerLine,
                align: alignLine,
                rows
            });
        
            continue;
        }

        if (line.startsWith('>')) {
            flushParagraph();
            tokens.push(parseNestedBlockquote());
            continue;
        }

        if (/^\s*([-+]|\d+\.)\s+/.test(rawLine)) {
            flushParagraph();
            tokens.push(...parseNestedList(indentLevel(rawLine)));
            continue;
        }

        if (/^\s*((-\s*){3,}|(\*\s*){3,}|(_\s*){3,})\s*$/.test(line)) {
            flushParagraph();
            tokens.push({ type:'hr' });
            i++;
            continue;
        }

        if (line.startsWith('###### ')) { flushParagraph(); tokens.push({type:'h6',content:line.slice(7)}); }
        else if (line.startsWith('##### ')) { flushParagraph(); tokens.push({type:'h5',content:line.slice(6)}); }
        else if (line.startsWith('#### ')) { flushParagraph(); tokens.push({type:'h4',content:line.slice(5)}); }
        else if (line.startsWith('### ')) { flushParagraph(); tokens.push({type:'h3',content:line.slice(4)}); }
        else if (line.startsWith('## ')) { flushParagraph(); tokens.push({type:'h2',content:line.slice(3)}); }
        else if (line.startsWith('# ')) { flushParagraph(); tokens.push({type:'h1',content:line.slice(2)}); }

        else if (line === '') {
            flushParagraph();
        }

        else {
            paragraphBuffer.push(line);
        }

        i++;
    }

    if (cont.state && cont.type==='codeblock') tokens.push(cont.value);

    flushParagraph();

    return tokens;
}

function parser(tokens) {
    const preview = tokens.map(token => {

        if (token.type === 'list') {

            const tag = token.ordered ? 'ol' : 'ul';

            const renderItems = (items) => {
                return items.map(item => {
                    let html = `<li>${inLineParser(item.content)}`;

                    if (item.children && item.children.length) {
                        html += parser(item.children);
                    }

                    html += `</li>`;
                    return html;
                }).join('');
            };

            return `<${tag}>${renderItems(token.items)}</${tag}>`;
        }

        else if (token.type === 'table') {

            const alignments = token.align
                .split('|')
                .filter(Boolean)
                .map(cell => {
                    cell = cell.trim();
                    if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
                    if (cell.endsWith(':')) return 'right';
                    if (cell.startsWith(':')) return 'left';
                    return 'left';
                });
        
            const headerCells = token.header
                .split('|')
                .filter(Boolean)
                .map((c, i) => `<th style="text-align:${alignments[i]}">${inLineParser(c.trim())}</th>`)
                .join('');
        
            const bodyRows = token.rows.map(r => {
                const cells = r.split('|')
                    .filter(Boolean)
                    .map((c, i) => `<td style="text-align:${alignments[i]}">${inLineParser(c.trim())}</td>`)
                    .join('');
        
                return `<tr>${cells}</tr>`;
            }).join('');
        
            return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
        }                      

        else if (token.type === 'codeblock') {
            return `<pre><code class="${token.lang}">${escapeHTML(token.content)}</code></pre>`;
        }

        else if (token.type === 'blockquote') {
            return `<blockquote>${parser(token.content)}</blockquote>`;
        }

        else if (token.type === 'br') return `<br>`;

        else if (token.type === 'hr') return `<hr>`;

        else return `<${token.type}>${inLineParser(token.content)}</${token.type}>`;
    });

    return preview.join('');
}

function updatePageTitleFromTokens(tokens) {
    const first = tokens.find(t => t.type !== 'br');

    if (first && first.type === 'h1') {
        const temp = document.createElement('div');
        temp.innerHTML = inLineParser(first.content);
        document.title = temp.textContent.trim() || 'Marky';
    } else {
        document.title = 'Marky';
    }
}

function downloadFile(filename, content) {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
}

function markDirty(state) {
    isDirty = state;
    document.querySelector('.unsaved-indicator')
        .classList.toggle('hidden', !state);

    saveBtn.style.opacity = state ? "1" : "0.5";
    saveBtn.style.pointerEvents = state ? "auto" : "none";
}

async function verifyPermission(handle) {
    const options = { mode: 'readwrite' };

    if ((await handle.queryPermission(options)) === 'granted') {
        return true;
    }

    if ((await handle.requestPermission(options)) === 'granted') {
        return true;
    }

    return false;
}

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = () => {
            request.result.createObjectStore(STORE_NAME);
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveHandle(handle) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, "file");
    return tx.complete;
}

async function getSavedHandle() {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get("file");

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

function updateFileName(name) {
    currentFileName = name;
    const label = document.querySelector('.file-name');
    if (label) label.textContent = name;
}

const supportsFileSystemAccess = 'showOpenFilePicker' in window;

const DB_NAME = "markyDB";
const STORE_NAME = "fileHandles";

let isDirty = false;
let lastSavedContent = "";

let currentFileHandle = null;
let currentFileName = "untitled.md";

const editor = document.querySelector('.editor');
const preview = document.querySelector('.preview');
const editorBtn = document.querySelector('.editor-btn');
const previewBtn = document.querySelector('.preview-btn');
const menuBtn = document.querySelector('.menu-btn');
const menuDropdown = document.querySelector('.menu-dropdown');
const newBtn = document.querySelector('.new-btn');
const openBtn = document.querySelector('.open-btn');
const saveBtn = document.querySelector('.save-btn');
const saveAsBtn = document.querySelector('.saveas-btn');
const fileInput = document.querySelector('.file-input');

let cachedText = editor.textContent;

editor.addEventListener('input', debounce(500, save));

editor.addEventListener('input', () => {
    const current = editor.textContent;

    if (current !== lastSavedContent) {
        markDirty(true);
    } else {
        markDirty(false);
    }
});

editorBtn.addEventListener('click', () => {

    preview.classList.add('hidden');
    editor.classList.remove('hidden');
    editorBtn.classList.add('active');
    previewBtn.classList.remove('active');

    editor.focus();

    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);

});

previewBtn.addEventListener('click', () => {

    editor.classList.add('hidden');
    preview.classList.remove('hidden');

    previewBtn.classList.add('active');
    editorBtn.classList.remove('active');

    cachedText = editor.textContent;
    const tokens = tokenizer(editor.textContent);
    preview.innerHTML = parser(tokens);
});

editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();

        const sel = window.getSelection();
        const range = sel.getRangeAt(0);

        const tabNode = document.createTextNode('\t');

        range.insertNode(tabNode);

        range.setStartAfter(tabNode);
        range.setEndAfter(tabNode);
        sel.removeAllRanges();
        sel.addRange(range);
    }
});

editor.addEventListener('input', debounce(500, () => {
    const tokens = tokenizer(editor.textContent);
    updatePageTitleFromTokens(tokens);
}));

menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    if (!menuDropdown.contains(e.target) && !menuBtn.contains(e.target)) {
        menuDropdown.classList.add('hidden');
    }
});

newBtn.addEventListener('click', () => {
    if (!confirm("Clear current document?")) return;

    editor.textContent = "";
    preview.innerHTML = "";
    location.hash = "";
    localStorage.removeItem("hash");

    currentFileName = "untitled.md";

    editor.focus();
});

openBtn.addEventListener('click', async () => {

    if (supportsFileSystemAccess) {
        try {
            const [handle] = await window.showOpenFilePicker({
                types: [{
                    description: 'Markdown Files',
                    accept: { 'text/markdown': ['.md', '.txt'] }
                }],
                multiple: false
            });

            currentFileHandle = handle;
            updateFileName(handle.name);

            await saveHandle(handle);

            const file = await handle.getFile();
            const text = await file.text();

            editor.textContent = text;
            lastSavedContent = text;
            markDirty(false);

            const tokens = tokenizer(text);
            preview.innerHTML = parser(tokens);

        } catch (err) {
            console.log("Open cancelled");
        }

    } else {
        fileInput.click();
    }
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
        editor.textContent = reader.result;
        updateFileName(file.name);

        const tokens = tokenizer(editor.textContent);
        preview.innerHTML = parser(tokens);
    };

    reader.readAsText(file);
});

saveBtn.addEventListener('click', async () => {

    if (supportsFileSystemAccess && currentFileHandle) {

        const hasPermission = await verifyPermission(currentFileHandle);
        if (!hasPermission) {
            alert("Permission lost. Use Save As.");
            return;
        }

        const writable = await currentFileHandle.createWritable();
        await writable.write(editor.textContent);
        await writable.close();

        await saveHandle(currentFileHandle);
        console.log("Saved handle:", await getSavedHandle());


        lastSavedContent = editor.textContent;
        markDirty(false);

        return;
    }

    downloadFile(currentFileName, editor.textContent);

    lastSavedContent = editor.textContent;
    markDirty(false);
});

saveAsBtn.addEventListener('click', async () => {

    if (supportsFileSystemAccess) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: currentFileName,
                types: [{
                    description: 'Markdown Files',
                    accept: { 'text/markdown': ['.md'] }
                }]
            });

            currentFileHandle = handle;
            updateFileName(handle.name);

            await saveHandle(handle);

            const writable = await handle.createWritable();
            await writable.write(editor.textContent);
            await writable.close();

            await saveHandle(currentFileHandle);
            console.log("Saved handle:", await getSavedHandle());


            lastSavedContent = editor.textContent;
            markDirty(false);

            document.querySelector('.file-name').textContent = currentFileName;

            return;

        } catch (err) {
            console.log("Save As cancelled");
        }
    }

    const name = prompt("Save as:", currentFileName);
    if (!name) return;

    currentFileName = name.endsWith(".md") ? name : name + ".md";
    downloadFile(currentFileName, editor.textContent);

    lastSavedContent = editor.textContent;
    markDirty(false);

    document.querySelector('.file-name').textContent = currentFileName;
});

load();