import { RepositorioMemoria } from '../../src/datos/RepositorioMemoria';
import { probarContratoRepositorio } from './contrato';

probarContratoRepositorio('en memoria', () => new RepositorioMemoria());
