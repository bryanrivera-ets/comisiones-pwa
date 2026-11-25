import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { RepositorioDexie } from '../../src/datos/RepositorioDexie';
import { nuevoId } from '../../src/datos/Repositorio';
import { probarContratoRepositorio } from './contrato';

const abiertos: RepositorioDexie[] = [];
afterEach(() => {
  for (const r of abiertos.splice(0)) r.cerrar();
});

function crear(nombre = `prueba-${nuevoId()}`): RepositorioDexie {
  const repo = new RepositorioDexie(nombre);
  abiertos.push(repo);
  return repo;
}

probarContratoRepositorio('IndexedDB (Dexie)', () => crear());

describe('Repositorio IndexedDB: persistencia', () => {
  it('los datos siguen ahí al abrir de nuevo la misma base', async () => {
    const nombre = `prueba-${nuevoId()}`;
    const primero = crear(nombre);
    await primero.guardarVendedor({ id: 'v1', nombre: 'Ana', budgetTrimestral: null, comision: 500, alias: [] });
    primero.cerrar();

    const segundo = crear(nombre);
    expect((await segundo.listarVendedores()).map((v) => v.nombre)).toEqual(['Ana']);
  });
});
