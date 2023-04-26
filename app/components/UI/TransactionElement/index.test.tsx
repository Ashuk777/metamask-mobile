import React from 'react';
import TransactionElement from './';
import configureMockStore from 'redux-mock-store';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';

const mockStore = configureMockStore();
const initialState = {
  engine: {
    backgroundState: {
      PreferencesController: {
        selectedAddress: '0x1',
        identities: {
          '0xbar': {
            name: 'Account 1',
            address: '0x0',
            importTime: Date.now(),
          },
        },
      },
      CurrencyRateController: {
        currentCurrency: 'usd',
        conversionRate: 0.1,
      },
      NetworkController: {
        providerConfig: {
          ticker: 'ETH',
          type: 'mainnet',
        },
      },
      TransactionController: {
        swapsTransactions: {},
      },
      SwapsController: {
        tokens: [],
      },
    },
  },
  settings: {
    primaryCurrency: 'ETH',
  },
};
const store = mockStore(initialState);

describe('TransactionElement', () => {
  it('should render correctly', () => {
    const { toJSON } = render(
      <Provider store={store}>
        <TransactionElement
          tx={{
            transaction: { to: '0x0', from: '0x1', nonce: 1 },
            status: 'CONFIRMED',
          }}
          i={1}
        />
      </Provider>,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
