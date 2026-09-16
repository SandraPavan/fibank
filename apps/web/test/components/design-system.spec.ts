import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import AppButton from '../../src/components/AppButton.vue';
import StatusPill from '../../src/components/StatusPill.vue';

describe('AppButton', () => {
  it('repassa o clique ao ouvinte do consumidor quando habilitado', async () => {
    const onClick = vi.fn();
    const wrapper = mount(AppButton, {
      attrs: { onClick },
      slots: { default: 'Entrar' },
    });

    await wrapper.trigger('click');

    expect(onClick).toHaveBeenCalledOnce();
    expect(wrapper.text()).toBe('Entrar');
  });

  it('fica desabilitado quando a prop disabled é verdadeira', () => {
    const wrapper = mount(AppButton, { props: { disabled: true } });

    expect(wrapper.attributes('disabled')).toBeDefined();
  });
});

describe('StatusPill', () => {
  it.each([
    ['success', '✓'],
    ['warning', '!'],
    ['error', '✕'],
  ])(
    'representa o status %s com texto e símbolo, não só cor',
    (status, symbol) => {
      const wrapper = mount(StatusPill, {
        props: {
          status: status as 'success' | 'warning' | 'error',
          label: 'Aprovado',
        },
      });

      expect(wrapper.text()).toContain('Aprovado');
      expect(wrapper.text()).toContain(symbol);
    },
  );
});
