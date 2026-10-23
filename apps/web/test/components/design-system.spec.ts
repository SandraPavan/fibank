import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import AppButton from '../../src/components/AppButton.vue';
import AppCurrencyInput from '../../src/components/AppCurrencyInput.vue';
import AppInput from '../../src/components/AppInput.vue';
import AppPinPad from '../../src/components/AppPinPad.vue';
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

describe('seletores data-testid (DEV-035)', () => {
  it('AppInput aplica testId no <input>, não no wrapper', () => {
    const wrapper = mount(AppInput, {
      props: { label: 'E-mail', testId: 'login-email-input' },
    });

    expect(
      wrapper.find('[data-testid="login-email-input"]').element.tagName,
    ).toBe('INPUT');
    expect(wrapper.attributes('data-testid')).toBeUndefined();
  });

  it('AppCurrencyInput aplica testId no <input>, não no wrapper', () => {
    const wrapper = mount(AppCurrencyInput, {
      props: { label: 'Valor (R$)', testId: 'transferir-valor-input' },
    });

    expect(
      wrapper.find('[data-testid="transferir-valor-input"]').element.tagName,
    ).toBe('INPUT');
    expect(wrapper.attributes('data-testid')).toBeUndefined();
  });

  it('AppPinPad expõe cada tecla por pin-pad-key-<dígito>', async () => {
    const wrapper = mount(AppPinPad);

    for (const digit of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(
        wrapper.find(`[data-testid="pin-pad-key-${digit}"]`).exists(),
      ).toBe(true);
    }
    await wrapper.find('[data-testid="pin-pad-key-7"]').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([['7']]);
    expect(wrapper.find('[data-testid="pin-pad-backspace"]').exists()).toBe(
      true,
    );
  });
});
