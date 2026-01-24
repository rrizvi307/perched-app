import { ViewProps } from 'react-native';

type AtmosphereProps = ViewProps & {
  variant?: 'warm' | 'cool';
};

export function Atmosphere(_: AtmosphereProps) {
  return null;
}

export default Atmosphere;
