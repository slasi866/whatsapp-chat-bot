import { h, mount } from '../core/dom.js';
import { endpoints } from '../core/api.js';
import { store } from '../core/store.js';
import { poll } from '../core/router.js';
import { toast } from '../core/toast.js';
import { icon } from '../components/icon.js';
import { avatar } from '../components/avatar.js';
import { badge, button, notice, searchInput, select, setLoading, textarea } from '../components/ui.js';
import { emptyState, skeletonList } from '../components/feedback.js';
import {
  dayKey,
  fmtDayLabel,
  fmtRelative,
  fmtTime,
  serviceWindowLeft,
  withinServiceWindow,
} from '../core/format.js';

/** The inbox owns the full height of the content column. */
export const flush = true;

const LIST_POLL_MS = 12000;
const THREAD_POLL_MS = 5000;

const STATUS_OPTIONS = [
  { value: '', label: 'Semua status' },
  { value: 'bot', label: 'Dijawab bot' },
  { value: 'human', label: 'Ditangani agent' },
];

export function skeleton() {
  return h(
    'div',
    { class: 'inbox' },
    h(
      'aside',
      { class: 'conv-pane' },
      h('div', { class: 'conv-pane-head' }, h('div', { class: 'skeleton', style: { height: '34px' } })),
      h('div', { class: 'conv-scroll' }, skeletonList(7)),
    ),
    h('section', { class: 'chat' }),
  );
}

export async function render() {
  const tenantId = store.tenantId;

  const convScroll = h('div', { class: 'conv-scroll' }, skeletonList(6));
  const chatPane = h('section', { class: 'chat' });

  const statusSelect = select({
    value: store.conversationFilter,
    options: STATUS_OPTIONS,
    onChange: (event) => {
      store.conversationFilter = event.target.value;
      loadConversations();
    },
  });

  const refreshButton = button({
    iconName: 'refresh',
    size: 'sm',
    variant: 'ghost',
    title: 'Muat ulang',
    onClick: () => loadConversations(),
  });

  const convPane = h(
    'aside',
    { class: 'conv-pane' },
    h(
      'div',
      { class: 'conv-pane-head' },
      searchInput({
        placeholder: 'Cari nama atau nomor...',
        value: store.conversationQuery,
        onInput: (event) => {
          store.conversationQuery = event.target.value;
          drawConversations();
        },
      }),
      h('div', { class: 'row' }, statusSelect, refreshButton),
    ),
    convScroll,
  );

  // --- Conversation list -------------------------------------------------

  function visibleConversations() {
    const term = store.conversationQuery.trim().toLowerCase();
    if (!term) return store.conversations;
    return store.conversations.filter(
      (conversation) =>
        (conversation.contact_name ?? '').toLowerCase().includes(term) ||
        conversation.contact_wa_id.includes(term),
    );
  }

  function drawConversations() {
    const list = visibleConversations();

    if (list.length === 0) {
      mount(
        convScroll,
        emptyState({
          iconName: store.conversations.length ? 'search' : 'message',
          title: store.conversations.length ? 'Tidak ada yang cocok' : 'Belum ada percakapan',
          message: store.conversations.length
            ? 'Ubah kata kunci atau filter status.'
            : 'Percakapan muncul di sini begitu customer mengirim pesan ke nomor WhatsApp company.',
        }),
      );
      return;
    }

    mount(
      convScroll,
      list.map((conversation) =>
        h(
          'button',
          {
            class: 'conv',
            role: 'option',
            'aria-selected': conversation.id === store.activeConversationId ? 'true' : 'false',
            onClick: () => selectConversation(conversation.id),
          },
          avatar(conversation.contact_name ?? conversation.contact_wa_id, conversation.contact_wa_id),
          h(
            'div',
            { class: 'conv-main' },
            h(
              'div',
              { class: 'conv-top' },
              h('span', {
                class: 'conv-name',
                text: conversation.contact_name || conversation.contact_wa_id,
              }),
              h('span', { class: 'conv-when', text: fmtRelative(conversation.last_message_at) }),
            ),
            h(
              'div',
              { class: 'conv-bottom' },
              conversation.status === 'human'
                ? badge('agent', 'warn', true)
                : badge('bot', 'success', true),
              !withinServiceWindow(conversation.last_inbound_at) &&
                badge('di luar 24 jam', null),
            ),
          ),
        ),
      ),
    );
  }

  async function loadConversations(quiet = false) {
    try {
      const { conversations } = await endpoints.listConversations(
        tenantId,
        store.conversationFilter,
      );
      store.conversations = conversations;
      drawConversations();

      if (store.activeConversationId) {
        const stillThere = conversations.some((item) => item.id === store.activeConversationId);
        if (!stillThere) {
          store.activeConversationId = null;
          drawChatPlaceholder();
        }
      }
    } catch (error) {
      if (!quiet) {
        mount(convScroll, emptyState({ iconName: 'alert', title: 'Gagal memuat', message: error.message }));
      }
    }
  }

  // --- Chat pane ---------------------------------------------------------

  function drawChatPlaceholder() {
    mount(
      chatPane,
      emptyState({
        iconName: 'message',
        title: 'Pilih percakapan',
        message: 'Transkrip dan kolom balasan muncul di sini.',
      }),
    );
  }

  function selectConversation(id) {
    store.activeConversationId = id;
    for (const node of convScroll.querySelectorAll('.conv')) {
      node.setAttribute('aria-selected', 'false');
    }
    drawConversations();
    loadMessages(id);
  }

  function buildTranscript(conversation, messages) {
    const scroll = h('div', { class: 'chat-scroll' });

    if (messages.length === 0) {
      scroll.appendChild(
        emptyState({ iconName: 'message', title: 'Belum ada pesan di percakapan ini.' }),
      );
      return scroll;
    }

    let lastDay = null;
    let lastSide = null;
    let lastAuthor = null;

    for (const message of messages) {
      const currentDay = dayKey(message.created_at);
      if (currentDay !== lastDay) {
        scroll.appendChild(h('div', { class: 'day-sep', text: fmtDayLabel(message.created_at) }));
        lastDay = currentDay;
        lastSide = null;
        lastAuthor = null;
      }

      const outbound = message.role !== 'user';
      const author =
        message.role === 'user'
          ? conversation.contact_name || conversation.contact_wa_id
          : message.role === 'agent'
            ? 'Agent'
            : 'Bot';

      const grouped = lastSide === outbound;
      scroll.appendChild(
        h(
          'div',
          { class: ['bubble', outbound && 'bubble--out', grouped && 'bubble--grouped'] },
          message.content,
          h(
            'div',
            { class: 'bubble-meta' },
            author !== lastAuthor && h('span', { class: 'bubble-author', text: author }),
            h('span', { text: fmtTime(message.created_at) }),
          ),
        ),
      );

      lastSide = outbound;
      lastAuthor = author;
    }

    return scroll;
  }

  function buildComposer(conversation) {
    const box = textarea({ placeholder: 'Tulis balasan sebagai agent...' });
    box.rows = 1;
    // Grow with the message instead of scrolling a one-line field.
    box.addEventListener('input', () => {
      box.style.height = 'auto';
      box.style.height = `${Math.min(140, box.scrollHeight)}px`;
    });

    const sendButton = button({
      iconName: 'send',
      variant: 'primary',
      title: 'Kirim',
      onClick: () => send(),
    });

    async function send() {
      const text = box.value.trim();
      if (!text) return;
      setLoading(sendButton, true);
      try {
        await endpoints.sendMessage(store.tenantId, conversation.id, text);
        box.value = '';
        box.style.height = 'auto';
        await loadMessages(conversation.id);
        await loadConversations(true);
      } catch (error) {
        toast(error.message, 'error');
      } finally {
        setLoading(sendButton, false);
      }
    }

    box.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send();
      }
    });

    return h(
      'div',
      {},
      h('div', { class: 'composer' }, box, sendButton),
      h('div', {
        class: 'composer-hint',
        text: 'Enter untuk kirim, Shift+Enter untuk baris baru.',
      }),
    );
  }

  async function loadMessages(conversationId, quiet = false) {
    const conversation = store.conversations.find((item) => item.id === conversationId);
    if (!conversation) return;

    if (!quiet) {
      mount(
        chatPane,
        h('div', { class: 'chat-scroll' }, skeletonList(4)),
      );
    }

    let messages;
    try {
      const data = await endpoints.listMessages(store.tenantId, conversationId);
      messages = data.messages;
    } catch (error) {
      if (!quiet) {
        mount(chatPane, emptyState({ iconName: 'alert', title: 'Gagal memuat', message: error.message }));
      }
      return;
    }

    // A background refresh must not discard what the agent is typing.
    const existingBox = chatPane.querySelector('.composer textarea');
    const draft = existingBox ? existingBox.value : '';
    const hadFocus = existingBox && document.activeElement === existingBox;
    const previousScroll = chatPane.querySelector('.chat-scroll');
    const wasAtBottom = previousScroll
      ? previousScroll.scrollHeight - previousScroll.scrollTop - previousScroll.clientHeight < 60
      : true;

    const isHuman = conversation.status === 'human';
    const canReply = withinServiceWindow(conversation.last_inbound_at);

    const ownerButton = button({
      label: isHuman ? 'Kembalikan ke bot' : 'Ambil alih',
      iconName: isHuman ? 'bot' : 'user',
      size: 'sm',
      variant: isHuman ? 'default' : 'primary',
      onClick: async () => {
        setLoading(ownerButton, true);
        try {
          if (isHuman) await endpoints.release(store.tenantId, conversationId);
          else await endpoints.takeover(store.tenantId, conversationId);
          toast(isHuman ? 'Dikembalikan ke bot.' : 'Percakapan diambil alih.', 'success');
          await loadConversations(true);
          await loadMessages(conversationId);
        } catch (error) {
          toast(error.message, 'error');
          setLoading(ownerButton, false);
        }
      },
    });

    const head = h(
      'header',
      { class: 'chat-head' },
      avatar(conversation.contact_name ?? conversation.contact_wa_id, conversation.contact_wa_id),
      h(
        'div',
        { class: 'truncate' },
        h('div', {
          class: 'strong truncate',
          text: conversation.contact_name || conversation.contact_wa_id,
        }),
        h('div', { class: 't-xs faint truncate', text: conversation.contact_wa_id }),
      ),
      h(
        'div',
        { class: 'row push' },
        isHuman ? badge('agent', 'warn', true) : badge('bot', 'success', true),
        canReply &&
          h(
            'span',
            { class: 'badge' },
            icon('clock', 12),
            h('span', { text: serviceWindowLeft(conversation.last_inbound_at) }),
          ),
        ownerButton,
      ),
    );

    const transcript = buildTranscript(conversation, messages);

    const footer = canReply
      ? h(
          'div',
          {},
          !isHuman &&
            h(
              'div',
              { class: 'chat-blocked' },
              notice(
                'Bot masih menjawab percakapan ini. Ambil alih dulu agar customer tidak menerima dua jawaban.',
                'warn',
              ),
            ),
          buildComposer(conversation),
        )
      : h(
          'div',
          { class: 'chat-blocked' },
          notice(
            'Sudah lewat 24 jam sejak pesan terakhir customer. Meta menolak balasan teks bebas di luar jendela itu, jadi lanjutkan dengan template yang sudah disetujui.',
            'warn',
          ),
        );

    mount(chatPane, head, transcript, footer);

    if (wasAtBottom) transcript.scrollTop = transcript.scrollHeight;
    else if (previousScroll) transcript.scrollTop = previousScroll.scrollTop;

    const newBox = chatPane.querySelector('.composer textarea');
    if (newBox && draft) {
      newBox.value = draft;
      newBox.style.height = 'auto';
      newBox.style.height = `${Math.min(140, newBox.scrollHeight)}px`;
      if (hadFocus) {
        newBox.focus();
        newBox.setSelectionRange(draft.length, draft.length);
      }
    }
  }

  // --- Wire up -----------------------------------------------------------

  drawChatPlaceholder();
  await loadConversations();

  if (store.activeConversationId) {
    await loadMessages(store.activeConversationId);
  }

  poll(() => loadConversations(true), LIST_POLL_MS);
  poll(() => {
    if (store.activeConversationId) loadMessages(store.activeConversationId, true);
  }, THREAD_POLL_MS);

  return h('div', { class: 'inbox' }, convPane, chatPane);
}
