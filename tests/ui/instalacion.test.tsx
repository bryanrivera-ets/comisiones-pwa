// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { escucharInstalacion } from '../../src/ui/instalacion';
import { montar } from './montar';

afterEach(cleanup);

escucharInstalacion();

/** Simula el aviso de Chrome/Edge "esta app se puede instalar". */
function avisoDelNavegador(respuesta: 'accepted' | 'dismissed') {
  const evento = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  evento.prompt = vi.fn(() => Promise.resolve());
  evento.userChoice = Promise.resolve({ outcome: respuesta });
  act(() => {
    window.dispatchEvent(evento);
  });
  return evento;
}

describe('botón Instalar app', () => {
  it('no aparece si el navegador no ofrece instalar', async () => {
    montar('/');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: /Instalar app/ })).toBeNull();
  });

  it('aparece cuando el navegador lo permite y abre su diálogo; si se rechaza, se oculta hasta el próximo aviso', async () => {
    montar('/');
    const evento = avisoDelNavegador('dismissed');
    expect(evento.defaultPrevented).toBe(true); // reemplazamos la mini barra del navegador por nuestro botón

    fireEvent.click(await screen.findByRole('button', { name: /Instalar app/ }));
    expect(evento.prompt).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('button', { name: /Instalar app/ })).toBeNull());

    // El navegador vuelve a avisar más tarde: el botón regresa.
    avisoDelNavegador('accepted');
    expect(await screen.findByRole('button', { name: /Instalar app/ })).toBeTruthy();
  });

  it('una vez instalada, ya no se ofrece', async () => {
    montar('/');
    const evento = avisoDelNavegador('accepted');
    fireEvent.click(await screen.findByRole('button', { name: /Instalar app/ }));
    expect(evento.prompt).toHaveBeenCalledOnce();
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    avisoDelNavegador('accepted');
    await waitFor(() => expect(screen.queryByRole('button', { name: /Instalar app/ })).toBeNull());
  });
});
