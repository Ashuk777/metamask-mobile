import React from 'react';
import { shallow } from 'enzyme';
import AdvancedSettings from './';
import configureMockStore from 'redux-mock-store';
import { Provider } from 'react-redux';
import renderWithProvider from '../../../../util/test/renderWithProvider';
import { ETH_SIGN_SWITCH_CONTAINER_TEST_ID } from './AdvancedSettings.testIds';
import { fireEvent, within } from '@testing-library/react-native';
import { strings } from '../../../../../locales/i18n';
import { Store, AnyAction } from 'redux';
import Routes from '../../../../constants/navigation/Routes';
import Engine from '../../../../core/Engine';

const mockStore = configureMockStore();
let initialState: any;
let store: Store<any, AnyAction>;
const mockNavigate = jest.fn();
let mockSetDisabledRpcMethodPreference: jest.Mock<any, any>;

beforeEach(() => {
  initialState = {
    settings: { showHexData: true },
    engine: {
      backgroundState: {
        PreferencesController: {
          ipfsGateway: 'https://ipfs.io/ipfs/',
          disabledRpcMethodPreferences: {
            eth_sign: false,
          },
        },
        NetworkController: {
          providerConfig: { chainId: '1' },
        },
      },
    },
  };
  store = mockStore(initialState);
  mockNavigate.mockClear();
  mockSetDisabledRpcMethodPreference.mockClear();
});

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    navigation: {
      navigate: mockNavigate,
    },
  };
});

const mockEngine = Engine;

jest.mock('../../../../core/Engine', () => {
  mockSetDisabledRpcMethodPreference = jest.fn();
  return {
    init: () => mockEngine.init({}),
    context: {
      PreferencesController: {
        setDisabledRpcMethodPreference: mockSetDisabledRpcMethodPreference,
      },
    },
  };
});

describe('AdvancedSettings', () => {
  it('should render correctly', () => {
    const wrapper = shallow(
      <Provider store={store}>
        <AdvancedSettings />
      </Provider>,
    );
    expect(wrapper).toMatchSnapshot();
  });

  it('should render eth_sign switch off by default with correct label', () => {
    const { getByTestId } = renderWithProvider(<AdvancedSettings />, {
      state: initialState,
    });

    const switchContainer = getByTestId(ETH_SIGN_SWITCH_CONTAINER_TEST_ID);
    expect(switchContainer).toBeDefined();

    const switchElement = within(switchContainer).getByRole('switch');
    expect(switchElement.props.value).toBe(false);

    const textElementOff = within(switchContainer).getByText(
      strings('app_settings.toggleEthSignOff'),
    );
    expect(textElementOff).toBeDefined();
  });

  it('should render eth_sign switch on with correct label', () => {
    initialState.engine.backgroundState.PreferencesController.disabledRpcMethodPreferences.eth_sign =
      true;

    const { getByTestId } = renderWithProvider(<AdvancedSettings />, {
      state: initialState,
    });

    const switchContainer = getByTestId(ETH_SIGN_SWITCH_CONTAINER_TEST_ID);
    expect(switchContainer).toBeDefined();

    const switchElement = within(switchContainer).getByRole('switch');
    expect(switchElement.props.value).toBe(true);

    const textElementOn = within(switchContainer).getByText(
      strings('app_settings.toggleEthSignOn'),
    );
    expect(textElementOn).toBeDefined();
  });

  it('should call navigate to EthSignFriction when eth_sign is switched on', async () => {
    const { getByTestId } = renderWithProvider(
      <AdvancedSettings navigation={{ navigate: mockNavigate }} />,
      {
        state: initialState,
      },
    );

    const switchContainer = getByTestId(ETH_SIGN_SWITCH_CONTAINER_TEST_ID);
    expect(switchContainer).toBeDefined();
    const switchElement = within(switchContainer).getByRole('switch');
    fireEvent(switchElement, 'onValueChange', true);
    expect(mockNavigate).toBeCalledWith(Routes.MODAL.ROOT_MODAL_FLOW, {
      screen: Routes.SHEET.SETTINGS_ADVANCED_ETH_SIGN_FRICTION,
    });
    expect(mockSetDisabledRpcMethodPreference).not.toBeCalled();
  });

  it('should directly set setting to off when switched off', async () => {
    const { getByTestId } = renderWithProvider(
      <AdvancedSettings navigation={{ navigate: mockNavigate }} />,
      {
        state: initialState,
      },
    );

    const switchContainer = getByTestId(ETH_SIGN_SWITCH_CONTAINER_TEST_ID);
    expect(switchContainer).toBeDefined();
    const switchElement = within(switchContainer).getByRole('switch');
    fireEvent(switchElement, 'onValueChange', false);
    expect(mockNavigate).not.toBeCalled();
    expect(mockSetDisabledRpcMethodPreference).toBeCalledWith(
      'eth_sign',
      false,
    );
  });
});
