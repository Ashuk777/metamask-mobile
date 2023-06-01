@androidApp
@confirmations
@regression

Feature: Sending ETH when Gas API is down
  A user should be able to send ETH when the Gas API is down.

  Scenario: Import wallet
    Given the app displayed the splash animation
    And I have imported my wallet
    And I tap No Thanks on the Enable security check screen
    And I tap No thanks on the onboarding welcome tutorial
                                                      
  Scenario Outline: Sending ETH when Gas API is down from inside MetaMask wallet
    Given Mock server is started with mock Gas API Down
    And Ganache server is started
    And I close the Whats New modal
    And Ganache network is selected
    When On the Main Wallet view I tap on the Send Action
    And I enter address "<Address>" in the sender's input box
    And I tap button "Next" on Send To view
    Then I proceed to the amount view
    When I type amount "<Amount>" into amount input field
    And I tap button "Next" on the Amount view
    Then I should be taken to the transaction confirmation view
    And the token amount <Amount> to be sent is visible
    When I tap Edit Gas link
    Then EIP1559 gas options should not be visible
    When I tap Save Gas Values
    And I tap button "Send" on Confirm Amount view
    Then I am on the main wallet view
    And the transaction is submitted with Transaction Complete! toast appearing
    Then Ganache server is stopped
    Examples:
      | Address                                    | Amount |
      | 0x1FDb169Ef12954F20A15852980e1F0C122BfC1D6 | 1      |
