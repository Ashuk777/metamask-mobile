import React from 'react';
import { render } from '@testing-library/react-native';
import ContactForm from './';
import configureMockStore from 'redux-mock-store';
import { Provider } from 'react-redux';

const mockStore = configureMockStore();
const initialState = {
  engine: {
    backgroundState: {
      NetworkController: {
        isCustomNetwork: false,
        network: '1',
        properties: {},
        providerConfig: { chainId: '1', ticker: 'ETH', type: 'mainnet' },
      },
      AddressBookController: {
        addressBook: {
          '0x51239E13Fe029cD52asA8babEBafb6814bc8Ba4b': {
            address: '0x51239E13Fe029cD52asA8babEBafb6814bc8Ba4b',
            chainId: '1',
            isEns: false,
            memo: '',
            name: 'aa',
          },
        },
      },
      PreferencesController: {
        identities: {
          '0x51239E13Fe029cD52asA8babEBafb6814bc8Ba4b': {
            address: '0x51239E13Fe029cD52asA8babEBafb6814bc8Ba4b',
            name: 'Account 1',
          },
        },
      },
    },
  },
};
const store = mockStore(initialState);

describe('ContactForm', () => {
  it('should render correctly', () => {
    const { toJSON } = render(
      <Provider store={store}>
        <ContactForm />
      </Provider>,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
