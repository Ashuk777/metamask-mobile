import React, { useState, useEffect, useCallback } from 'react';

import { StyleSheet, Alert, InteractionManager } from 'react-native';
import PropTypes from 'prop-types';
import { connect, useSelector } from 'react-redux';
import { ethers } from 'ethers';
import abi from 'human-standard-token-abi';
import { ethErrors } from 'eth-json-rpc-errors';

import Approval from '../../Views/Approval';
import NotificationManager from '../../../core/NotificationManager';
import Engine from '../../../core/Engine';
import { strings } from '../../../../locales/i18n';
import { hexToBN, fromWei, isZeroValue } from '../../../util/number';
import {
  setEtherTransaction,
  setTransactionObject,
} from '../../../actions/transaction';
import Modal from 'react-native-modal';
import WalletConnect from '../../../core/WalletConnect';
import {
  getMethodData,
  TOKEN_METHOD_TRANSFER,
  APPROVE_FUNCTION_SIGNATURE,
  getTokenValueParam,
  getTokenAddressParam,
  calcTokenAmount,
  getTokenValueParamAsHex,
  isSwapTransaction,
} from '../../../util/transactions';
import { BN } from 'ethereumjs-util';
import Logger from '../../../util/Logger';
import Approve from '../../Views/ApproveView/Approve';
import WatchAssetRequest from '../../UI/WatchAssetRequest';
import AccountApproval from '../../UI/AccountApproval';
import TransactionTypes from '../../../core/TransactionTypes';
import AddCustomNetwork from '../../UI/AddCustomNetwork';
import SwitchCustomNetwork from '../../UI/SwitchCustomNetwork';
import {
  toggleDappTransactionModal,
  toggleApproveModal,
} from '../../../actions/modals';
import { swapsUtils } from '@metamask/swaps-controller';
import { ApprovalType, query } from '@metamask/controller-utils';
import Analytics from '../../../core/Analytics/Analytics';
import BigNumber from 'bignumber.js';
import { getTokenList } from '../../../reducers/tokens';
import { toLowerCaseEquals } from '../../../util/general';
import { KEYSTONE_TX_CANCELED } from '../../../constants/error';
import { MetaMetricsEvents } from '../../../core/Analytics';
import AnalyticsV2 from '../../../util/analyticsV2';

import { useTheme } from '../../../util/theme';
import withQRHardwareAwareness from '../../UI/QRHardware/withQRHardwareAwareness';
import QRSigningModal from '../../UI/QRHardware/QRSigningModal';
import SignatureRequestRoot from '../../UI/SignatureRequest/Root';
import { networkSwitched } from '../../../actions/onboardNetwork';
import {
  selectChainId,
  selectProviderType,
} from '../../../selectors/networkController';
import { createAccountConnectNavDetails } from '../../Views/AccountConnect';

const hstInterface = new ethers.utils.Interface(abi);

const styles = StyleSheet.create({
  bottomModal: {
    justifyContent: 'flex-end',
    margin: 0,
  },
});
const RootRPCMethodsUI = (props) => {
  const { colors } = useTheme();
  const [showPendingApproval, setShowPendingApproval] = useState(false);
  const [walletConnectRequestInfo, setWalletConnectRequestInfo] =
    useState(undefined);
  const [currentPageMeta, setCurrentPageMeta] = useState({});

  const tokenList = useSelector(getTokenList);

  const [customNetworkToAdd, setCustomNetworkToAdd] = useState(null);
  const [customNetworkToSwitch, setCustomNetworkToSwitch] = useState(null);

  const [hostToApprove, setHostToApprove] = useState(null);

  const [watchAsset, setWatchAsset] = useState(false);
  const [suggestedAssetMeta, setSuggestedAssetMeta] = useState(undefined);

  const setTransactionObject = props.setTransactionObject;
  const toggleApproveModal = props.toggleApproveModal;
  const toggleDappTransactionModal = props.toggleDappTransactionModal;
  const setEtherTransaction = props.setEtherTransaction;

  // Reject pending approval using MetaMask SDK.
  const rejectPendingApproval = (id, error) => {
    const { ApprovalController } = Engine.context;
    try {
      ApprovalController.reject(id, error);
    } catch (error) {
      Logger.error(error, 'Reject while rejecting pending connection request');
    }
  };

  // Accept pending approval using MetaMask SDK.
  const acceptPendingApproval = (id, requestData) => {
    const { ApprovalController } = Engine.context;
    try {
      ApprovalController.accept(id, requestData);
    } catch (err) {
      // Ignore err if request already approved or doesn't exists.
    }
  };

  const showPendingApprovalModal = ({ type, origin }) => {
    InteractionManager.runAfterInteractions(() => {
      setShowPendingApproval({ type, origin });
    });
  };

  const onUnapprovedMessage = (messageParams, type, origin) => {
    setCurrentPageMeta(messageParams.meta);
    const signMessageParams = { ...messageParams };
    delete signMessageParams.meta;
    setSignMessageParams(signMessageParams);
    setSignType(type);
    showPendingApprovalModal({
      type,
      origin: signMessageParams.origin || origin,
    });
  };

  const initializeWalletConnect = () => {
    WalletConnect.init();
  };

  const trackSwaps = useCallback(
    async (event, transactionMeta) => {
      try {
        const { TransactionController } = Engine.context;
        const newSwapsTransactions = props.swapsTransactions;
        const swapTransaction = newSwapsTransactions[transactionMeta.id];
        const {
          sentAt,
          gasEstimate,
          ethAccountBalance,
          approvalTransactionMetaId,
        } = swapTransaction.paramsForAnalytics;

        const approvalTransaction =
          TransactionController.state.transactions.find(
            ({ id }) => id === approvalTransactionMetaId,
          );
        const ethBalance = await query(
          TransactionController.ethQuery,
          'getBalance',
          [props.selectedAddress],
        );
        const receipt = await query(
          TransactionController.ethQuery,
          'getTransactionReceipt',
          [transactionMeta.transactionHash],
        );

        const currentBlock = await query(
          TransactionController.ethQuery,
          'getBlockByHash',
          [receipt.blockHash, false],
        );
        let approvalReceipt;
        if (approvalTransaction?.transactionHash) {
          approvalReceipt = await query(
            TransactionController.ethQuery,
            'getTransactionReceipt',
            [approvalTransaction.transactionHash],
          );
        }
        const tokensReceived = swapsUtils.getSwapsTokensReceived(
          receipt,
          approvalReceipt,
          transactionMeta?.transaction,
          approvalTransaction?.transaction,
          swapTransaction.destinationToken,
          ethAccountBalance,
          ethBalance,
        );

        newSwapsTransactions[transactionMeta.id].gasUsed = receipt.gasUsed;
        if (tokensReceived) {
          newSwapsTransactions[transactionMeta.id].receivedDestinationAmount =
            new BigNumber(tokensReceived, 16).toString(10);
        }
        TransactionController.update({
          swapsTransactions: newSwapsTransactions,
        });

        const timeToMine = currentBlock.timestamp - sentAt;
        const estimatedVsUsedGasRatio = `${new BigNumber(receipt.gasUsed)
          .div(gasEstimate)
          .times(100)
          .toFixed(2)}%`;
        const quoteVsExecutionRatio = `${swapsUtils
          .calcTokenAmount(
            tokensReceived || '0x0',
            swapTransaction.destinationTokenDecimals,
          )
          .div(swapTransaction.destinationAmount)
          .times(100)
          .toFixed(2)}%`;
        const tokenToAmountReceived = swapsUtils.calcTokenAmount(
          tokensReceived,
          swapTransaction.destinationToken.decimals,
        );
        const analyticsParams = { ...swapTransaction.analytics };
        delete newSwapsTransactions[transactionMeta.id].analytics;
        delete newSwapsTransactions[transactionMeta.id].paramsForAnalytics;

        InteractionManager.runAfterInteractions(() => {
          const parameters = {
            ...analyticsParams,
            time_to_mine: timeToMine,
            estimated_vs_used_gasRatio: estimatedVsUsedGasRatio,
            quote_vs_executionRatio: quoteVsExecutionRatio,
            token_to_amount_received: tokenToAmountReceived.toString(),
          };
          Analytics.trackEventWithParameters(event, {});
          Analytics.trackEventWithParameters(event, parameters, true);
        });
      } catch (e) {
        Logger.error(e, MetaMetricsEvents.SWAP_TRACKING_FAILED);
        InteractionManager.runAfterInteractions(() => {
          Analytics.trackEvent(MetaMetricsEvents.SWAP_TRACKING_FAILED, {
            error: e,
          });
        });
      }
    },
    [props.selectedAddress, props.swapsTransactions],
  );

  const autoSign = useCallback(
    async (transactionMeta) => {
      const { TransactionController, KeyringController } = Engine.context;
      try {
        TransactionController.hub.once(
          `${transactionMeta.id}:finished`,
          (transactionMeta) => {
            if (transactionMeta.status === 'submitted') {
              NotificationManager.watchSubmittedTransaction({
                ...transactionMeta,
                assetType: transactionMeta.transaction.assetType,
              });
            } else {
              if (props.swapsTransactions[transactionMeta.id]?.analytics) {
                trackSwaps(MetaMetricsEvents.SWAP_FAILED, transactionMeta);
              }
              throw transactionMeta.error;
            }
          },
        );
        TransactionController.hub.once(
          `${transactionMeta.id}:confirmed`,
          (transactionMeta) => {
            if (props.swapsTransactions[transactionMeta.id]?.analytics) {
              trackSwaps(MetaMetricsEvents.SWAP_COMPLETED, transactionMeta);
            }
          },
        );
        await KeyringController.resetQRKeyringState();
        await TransactionController.approveTransaction(transactionMeta.id);
      } catch (error) {
        if (!error?.message.startsWith(KEYSTONE_TX_CANCELED)) {
          Alert.alert(
            strings('transactions.transaction_error'),
            error && error.message,
            [{ text: strings('navigation.ok') }],
          );
          Logger.error(error, 'error while trying to send transaction (Main)');
        } else {
          AnalyticsV2.trackEvent(
            MetaMetricsEvents.QR_HARDWARE_TRANSACTION_CANCELED,
          );
        }
      }
    },
    [props.swapsTransactions, trackSwaps],
  );

  const onUnapprovedTransaction = useCallback(
    async (transactionMeta) => {
      if (transactionMeta.origin === TransactionTypes.MMM) return;

      const to = transactionMeta.transaction.to?.toLowerCase();
      const { data } = transactionMeta.transaction;

      if (isSwapTransaction(data, transactionMeta.origin, to, props.chainId)) {
        autoSign(transactionMeta);
      } else {
        const {
          transaction: { value, gas, gasPrice, data },
        } = transactionMeta;
        const { AssetsContractController } = Engine.context;
        transactionMeta.transaction.gas = hexToBN(gas);
        transactionMeta.transaction.gasPrice = gasPrice && hexToBN(gasPrice);

        if (
          (value === '0x0' || !value) &&
          data &&
          data !== '0x' &&
          to &&
          (await getMethodData(data)).name === TOKEN_METHOD_TRANSFER
        ) {
          let asset = props.tokens.find(({ address }) =>
            toLowerCaseEquals(address, to),
          );
          if (!asset) {
            // try to lookup contract by lowercased address `to`
            asset = tokenList[to];

            if (!asset) {
              try {
                asset = {};
                asset.decimals =
                  await AssetsContractController.getERC20TokenDecimals(to);
                asset.symbol =
                  await AssetsContractController.getERC721AssetSymbol(to);
                // adding `to` here as well
                asset.address = to;
              } catch (e) {
                // This could fail when requesting a transfer in other network
                // adding `to` here as well
                asset = { symbol: 'ERC20', decimals: new BN(0), address: to };
              }
            }
          }

          const tokenData = hstInterface.parseTransaction({ data });
          const tokenValue = getTokenValueParam(tokenData);
          const toAddress = getTokenAddressParam(tokenData);
          const tokenAmount =
            tokenData && calcTokenAmount(tokenValue, asset.decimals).toFixed();

          transactionMeta.transaction.value = hexToBN(
            getTokenValueParamAsHex(tokenData),
          );
          transactionMeta.transaction.readableValue = tokenAmount;
          transactionMeta.transaction.to = toAddress;

          setTransactionObject({
            type: 'INDIVIDUAL_TOKEN_TRANSACTION',
            selectedAsset: asset,
            id: transactionMeta.id,
            origin: transactionMeta.origin,
            ...transactionMeta.transaction,
          });
        } else {
          transactionMeta.transaction.value = hexToBN(value);
          transactionMeta.transaction.readableValue = fromWei(
            transactionMeta.transaction.value,
          );

          setEtherTransaction({
            id: transactionMeta.id,
            origin: transactionMeta.origin,
            ...transactionMeta.transaction,
          });
        }

        if (
          data &&
          data.substr(0, 10) === APPROVE_FUNCTION_SIGNATURE &&
          (!value || isZeroValue(value))
        ) {
          toggleApproveModal();
        } else {
          toggleDappTransactionModal();
        }
      }
    },
    [
      props.tokens,
      props.chainId,
      setEtherTransaction,
      setTransactionObject,
      toggleApproveModal,
      toggleDappTransactionModal,
      autoSign,
      tokenList,
    ],
  );

  const onSignAction = () => setShowPendingApproval(false);

  const toggleExpandedMessage = () =>
    setShowExpandedMessage(!showExpandedMessage);

  const isSigningApprovalType = (type) =>
    type === ApprovalType.PersonalSign ||
    type === ApprovalType.EthSign ||
    type === ApprovalType.EthSignTypedData;

  const renderSigningModal = () => (
    <Modal
      isVisible={isSigningApprovalType(showPendingApproval?.type)}
      animationIn="slideInUp"
      animationOut="slideOutDown"
      style={styles.bottomModal}
      backdropColor={colors.overlay.default}
      backdropOpacity={1}
      animationInTiming={600}
      animationOutTiming={600}
      onBackdropPress={onSignAction}
      onBackButtonPress={
        showExpandedMessage ? toggleExpandedMessage : onSignAction
      }
      onSwipeComplete={onSignAction}
      swipeDirection={'down'}
      propagateSwipe
    >
      {signType === ApprovalType.PersonalSign && (
        <PersonalSign
          messageParams={signMessageParams}
          onCancel={onSignAction}
          onConfirm={onSignAction}
          currentPageInformation={currentPageMeta}
          toggleExpandedMessage={toggleExpandedMessage}
          showExpandedMessage={showExpandedMessage}
        />
      )}
      {signType === ApprovalType.EthSignTypedData && (
        <TypedSign
          navigation={props.navigation}
          messageParams={signMessageParams}
          onCancel={onSignAction}
          onConfirm={onSignAction}
          currentPageInformation={currentPageMeta}
          toggleExpandedMessage={toggleExpandedMessage}
          showExpandedMessage={showExpandedMessage}
        />
      )}
      {signType === ApprovalType.EthSign && (
        <MessageSign
          navigation={props.navigation}
          messageParams={signMessageParams}
          onCancel={onSignAction}
          onConfirm={onSignAction}
          currentPageInformation={currentPageMeta}
          toggleExpandedMessage={toggleExpandedMessage}
          showExpandedMessage={showExpandedMessage}
        />
      )}
    </Modal>
  );

  const renderQRSigningModal = () => {
    const {
      isSigningQRObject,
      QRState,
      approveModalVisible,
      dappTransactionModalVisible,
    } = props;
    const shouldRenderThisModal =
      !showPendingApproval &&
      !approveModalVisible &&
      !dappTransactionModalVisible &&
      isSigningQRObject;
    return (
      shouldRenderThisModal && (
        <QRSigningModal isVisible={isSigningQRObject} QRState={QRState} />
      )
    );
  };

  const onWalletConnectSessionApproval = () => {
    setShowPendingApproval(false);
    acceptPendingApproval(
      walletConnectRequestInfo.id,
      walletConnectRequestInfo.data,
    );
    setWalletConnectRequestInfo(undefined);
  };

  const onWalletConnectSessionRejected = () => {
    setShowPendingApproval(false);
    rejectPendingApproval(
      walletConnectRequestInfo.id,
      ethErrors.provider.userRejectedRequest(),
    );
    setWalletConnectRequestInfo(undefined);
  };

  const renderWalletConnectSessionRequestModal = () => {
    const meta = walletConnectRequestInfo?.data?.peerMeta || null;
    return (
      <Modal
        isVisible={showPendingApproval?.type === ApprovalType.WalletConnect}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        style={styles.bottomModal}
        backdropColor={colors.overlay.default}
        backdropOpacity={1}
        animationInTiming={300}
        animationOutTiming={300}
        onSwipeComplete={onWalletConnectSessionRejected}
        onBackButtonPress={onWalletConnectSessionRejected}
        swipeDirection={'down'}
      >
        <AccountApproval
          onCancel={onWalletConnectSessionRejected}
          onConfirm={onWalletConnectSessionApproval}
          currentPageInformation={{
            title: meta?.name,
            url: meta?.url,
            icon: meta?.icons?.[0],
          }}
          walletConnectRequest
        />
      </Modal>
    );
  };

  const renderDappTransactionModal = () =>
    props.dappTransactionModalVisible && (
      <Approval
        navigation={props.navigation}
        dappTransactionModalVisible
        toggleDappTransactionModal={props.toggleDappTransactionModal}
      />
    );

  const renderApproveModal = () =>
    props.approveModalVisible && (
      <Approve modalVisible toggleApproveModal={props.toggleApproveModal} />
    );

  const onAddCustomNetworkReject = () => {
    setShowPendingApproval(false);
    rejectPendingApproval(
      customNetworkToAdd.id,
      ethErrors.provider.userRejectedRequest(),
    );
  };

  const onAddCustomNetworkConfirm = () => {
    setShowPendingApproval(false);
    acceptPendingApproval(customNetworkToAdd.id, customNetworkToAdd.data);
  };

  /**
   * Render the modal that asks the user to add chain to wallet.
   */
  const renderAddCustomNetworkModal = () => (
    <Modal
      isVisible={showPendingApproval?.type === ApprovalType.AddEthereumChain}
      animationIn="slideInUp"
      animationOut="slideOutDown"
      style={styles.bottomModal}
      backdropColor={colors.overlay.default}
      backdropOpacity={1}
      animationInTiming={300}
      animationOutTiming={300}
      onSwipeComplete={onAddCustomNetworkReject}
      onBackdropPress={onAddCustomNetworkReject}
    >
      <AddCustomNetwork
        onCancel={onAddCustomNetworkReject}
        onConfirm={onAddCustomNetworkConfirm}
        currentPageInformation={currentPageMeta}
        customNetworkInformation={customNetworkToAdd?.data}
      />
    </Modal>
  );

  const onSwitchCustomNetworkReject = () => {
    setShowPendingApproval(false);
    rejectPendingApproval(
      customNetworkToSwitch.id,
      ethErrors.provider.userRejectedRequest(),
    );
  };

  const onSwitchCustomNetworkConfirm = () => {
    setShowPendingApproval(false);
    acceptPendingApproval(customNetworkToSwitch.id, customNetworkToSwitch.data);
    props.networkSwitched({
      networkUrl: customNetworkToSwitch.data.rpcUrl,
      networkStatus: true,
    });
  };

  /**
   * Render the modal that asks the user to switch chain on wallet.
   */
  const renderSwitchCustomNetworkModal = () => (
    <Modal
      isVisible={showPendingApproval?.type === ApprovalType.SwitchEthereumChain}
      animationIn="slideInUp"
      animationOut="slideOutDown"
      style={styles.bottomModal}
      backdropColor={colors.overlay.default}
      backdropOpacity={1}
      animationInTiming={300}
      animationOutTiming={300}
      onSwipeComplete={onSwitchCustomNetworkReject}
      onBackdropPress={onSwitchCustomNetworkReject}
      swipeDirection={'down'}
    >
      <SwitchCustomNetwork
        onCancel={onSwitchCustomNetworkReject}
        onConfirm={onSwitchCustomNetworkConfirm}
        currentPageInformation={currentPageMeta}
        customNetworkInformation={customNetworkToSwitch?.data}
        type={customNetworkToSwitch?.data.type}
      />
    </Modal>
  );

  /**
   * When user clicks on approve to connect with a dapp using the MetaMask SDK.
   */
  const onAccountsConfirm = () => {
    if (hostToApprove) {
      acceptPendingApproval(hostToApprove.id, hostToApprove.requestData);
    }
    setShowPendingApproval(false);
  };

  /**
   * When user clicks on reject to connect with a dapp using the MetaMask SDK.
   */
  const onAccountsReject = () => {
    rejectPendingApproval(hostToApprove.id, hostToApprove.requestData);
    setShowPendingApproval(false);
  };

  /**
   * Render the modal that asks the user to approve/reject connections to a dapp using the MetaMask SDK.
   */
  const renderAccountsApprovalModal = () => (
    <Modal
      isVisible={showPendingApproval?.type === ApprovalType.ConnectAccounts}
      animationIn="slideInUp"
      animationOut="slideOutDown"
      style={styles.bottomModal}
      backdropColor={colors.overlay.default}
      backdropOpacity={1}
      animationInTiming={300}
      animationOutTiming={300}
      onSwipeComplete={onAccountsReject}
      onBackdropPress={onAccountsReject}
      swipeDirection={'down'}
    >
      <AccountApproval
        onCancel={onAccountsReject}
        onConfirm={onAccountsConfirm}
        navigation={props.navigation}
        currentPageInformation={currentPageMeta}
      />
    </Modal>
  );

  /**
   * On rejection addinga an asset
   */
  const onCancelWatchAsset = () => {
    setWatchAsset(false);
  };

  /**
   * Render the add asset modal
   */
  const renderWatchAssetModal = () => (
    <Modal
      isVisible={watchAsset}
      animationIn="slideInUp"
      animationOut="slideOutDown"
      style={styles.bottomModal}
      backdropColor={colors.overlay.default}
      backdropOpacity={1}
      animationInTiming={600}
      animationOutTiming={600}
      onBackdropPress={onCancelWatchAsset}
      onSwipeComplete={onCancelWatchAsset}
      swipeDirection={'down'}
      propagateSwipe
    >
      <WatchAssetRequest
        onCancel={onCancelWatchAsset}
        onConfirm={onCancelWatchAsset}
        suggestedAssetMeta={suggestedAssetMeta}
        currentPageInformation={currentPageMeta}
      />
    </Modal>
  );

  // unapprovedTransaction effect
  useEffect(() => {
    Engine.context.TransactionController.hub.on(
      'unapprovedTransaction',
      onUnapprovedTransaction,
    );
    return () => {
      Engine.context.TransactionController.hub.removeListener(
        'unapprovedTransaction',
        onUnapprovedTransaction,
      );
    };
  }, [onUnapprovedTransaction]);

  const handlePendingApprovals = async (approval) => {
    //TODO: IF WE RECEIVE AN APPROVAL REQUEST, AND WE HAVE ONE ACTIVE, SHOULD WE HIDE THE CURRENT ONE OR NOT?

    if (approval.pendingApprovalCount > 0) {
      const key = Object.keys(approval.pendingApprovals)[0];
      const request = approval.pendingApprovals[key];
      const requestData = request.requestData;
      if (requestData.pageMeta) {
        setCurrentPageMeta(requestData.pageMeta);
      }

      switch (request.type) {
        case ApprovalType.WalletRequestPermissions:
          if (requestData?.permissions?.eth_accounts) {
            const {
              metadata: { id },
            } = requestData;

            const totalAccounts = props.accountsLength;

            AnalyticsV2.trackEvent(MetaMetricsEvents.CONNECT_REQUEST_STARTED, {
              number_of_accounts: totalAccounts,
              source: 'PERMISSION SYSTEM',
            });

            props.navigation.navigate(
              ...createAccountConnectNavDetails({
                hostInfo: requestData,
                permissionRequestId: id,
              }),
            );
          }
          break;
        case ApprovalType.ConnectAccounts:
          setHostToApprove({ data: requestData, id: request.id });
          showPendingApprovalModal({
            type: ApprovalType.ConnectAccounts,
            origin: request.origin,
          });
          break;
        case ApprovalType.SwitchEthereumChain:
          setCustomNetworkToSwitch({ data: requestData, id: request.id });
          showPendingApprovalModal({
            type: ApprovalType.SwitchEthereumChain,
            origin: request.origin,
          });
          break;
        case ApprovalType.AddEthereumChain:
          setCustomNetworkToAdd({ data: requestData, id: request.id });
          showPendingApprovalModal({
            type: ApprovalType.AddEthereumChain,
            origin: request.origin,
          });
          break;
        case ApprovalType.WalletConnect:
          setWalletConnectRequestInfo({ data: requestData, id: request.id });
          showPendingApprovalModal({
            type: ApprovalType.WalletConnect,
            origin: request.origin,
          });
          break;
        default:
          break;
      }
    } else {
      setShowPendingApproval(false);
    }
  };

  useEffect(() => {
    initializeWalletConnect();

    Engine.controllerMessenger.subscribe(
      'ApprovalController:stateChange',
      handlePendingApprovals,
    );

    Engine.context.TokensController.hub.on(
      'pendingSuggestedAsset',
      (suggestedAssetMeta) => {
        setSuggestedAssetMeta(suggestedAssetMeta);
        setWatchAsset(true);
      },
    );

    return function cleanup() {
      Engine.context.TokensController.hub.removeAllListeners();
      Engine.controllerMessenger.unsubscribe(
        'ApprovalController:stateChange',
        handlePendingApprovals,
      );
      WalletConnect.hub.removeAllListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <React.Fragment>
      <SignatureRequestRoot />
      {renderWalletConnectSessionRequestModal()}
      {renderDappTransactionModal()}
      {renderApproveModal()}
      {renderAddCustomNetworkModal()}
      {renderSwitchCustomNetworkModal()}
      {renderWatchAssetModal()}
      {renderQRSigningModal()}
      {renderAccountsApprovalModal()}
    </React.Fragment>
  );
};

RootRPCMethodsUI.propTypes = {
  swapsTransactions: PropTypes.object,
  /**
   * Object that represents the navigator
   */
  navigation: PropTypes.object,
  /**
   * Action that sets an ETH transaction
   */
  setEtherTransaction: PropTypes.func,
  /**
   * Action that sets a transaction
   */
  setTransactionObject: PropTypes.func,
  /**
   * Array of ERC20 assets
   */
  tokens: PropTypes.array,
  /**
  /* Hides or shows dApp transaction modal
  */
  toggleDappTransactionModal: PropTypes.func,
  /**
  /* Hides or shows approve modal
  */
  toggleApproveModal: PropTypes.func,
  /**
  /* dApp transaction modal visible or not
  */
  dappTransactionModalVisible: PropTypes.bool,
  /**
  /* Token approve modal visible or not
  */
  approveModalVisible: PropTypes.bool,
  /**
   * Selected address
   */
  selectedAddress: PropTypes.string,
  /**
   * Chain id
   */
  chainId: PropTypes.string,
  isSigningQRObject: PropTypes.bool,
  QRState: PropTypes.object,
  /**
   * updates redux when network is switched
   */
  networkSwitched: PropTypes.func,
  accountsLength: PropTypes.number,
};

const mapStateToProps = (state) => ({
  selectedAddress:
    state.engine.backgroundState.PreferencesController.selectedAddress,
  chainId: selectChainId(state),
  tokens: state.engine.backgroundState.TokensController.tokens,
  dappTransactionModalVisible: state.modals.dappTransactionModalVisible,
  approveModalVisible: state.modals.approveModalVisible,
  swapsTransactions:
    state.engine.backgroundState.TransactionController.swapsTransactions || {},
  providerType: selectProviderType(state),
  accountsLength: Object.keys(
    state.engine.backgroundState.AccountTrackerController.accounts || {},
  ).length,
});

const mapDispatchToProps = (dispatch) => ({
  setEtherTransaction: (transaction) =>
    dispatch(setEtherTransaction(transaction)),
  setTransactionObject: (transaction) =>
    dispatch(setTransactionObject(transaction)),
  toggleDappTransactionModal: (show = null) =>
    dispatch(toggleDappTransactionModal(show)),
  toggleApproveModal: (show) => dispatch(toggleApproveModal(show)),
  networkSwitched: ({ networkUrl, networkStatus }) =>
    dispatch(networkSwitched({ networkUrl, networkStatus })),
});

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(withQRHardwareAwareness(RootRPCMethodsUI));
