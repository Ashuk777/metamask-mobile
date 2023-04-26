import React from 'react';
import { render } from '@testing-library/react-native';
import QrScanner from './';
import { Provider } from 'react-redux';
import configureMockStore from 'redux-mock-store';

const noop = () => null;

const mockStore = configureMockStore();
const initialState = {
  engine: {
    backgroundState: {
      NetworkController: {
        providerConfig: {
          chainId: 4,
        },
      },
    },
  },
};
const store = mockStore(initialState);

describe('QrScanner', () => {
  it('should render correctly', () => {
    const { toJSON } = render(
      <Provider store={store}>
        <QrScanner
          navigation={{}}
          route={{
            params: {
              onScanError: noop,
              onScanSuccess: noop,
              onStartScan: noop,
            },
          }}
        />
      </Provider>,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
