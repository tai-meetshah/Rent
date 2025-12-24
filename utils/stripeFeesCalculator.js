// utils/stripeFeesCalculator.js

const stripe = require('../config/stripe');

/**
 * Get actual Stripe charges from a payment intent
 * @param {string} paymentIntentId - Stripe Payment Intent ID
 * @returns {Object} Actual fee breakdown from Stripe
 */
const getStripePaymentFees = async paymentIntentId => {
    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(
            paymentIntentId
        );

        if (!paymentIntent.latest_charge) {
            return {
                percentageFee: 0,
                fixedFee: 0,
                totalFee: 0,
                currency: 'aud',
                chargeId: null,
            };
        }

        // Retrieve the actual charge to get fee details
        const charge = await stripe.charges.retrieve(
            paymentIntent.latest_charge
        );
        // Get balance transaction to see actual fees charged by Stripe
        const balanceTransaction = await stripe.balanceTransactions.retrieve(
            charge.balance_transaction
        );

        // Stripe returns fee in cents, convert to dollars
        const totalFee = balanceTransaction.fee / 100;
        const amount = balanceTransaction.amount / 100;
        const net = balanceTransaction.net / 100;

        // Calculate breakdown (Stripe typically charges percentage + fixed)
        // We can infer the breakdown from the total
        const percentageFee = totalFee - 0.3; // Subtract typical fixed fee
        const fixedFee = 0.3;

        return {
            amount: Number(amount.toFixed(2)),
            totalFee: Number(totalFee.toFixed(2)),
            percentageFee: Number(percentageFee.toFixed(2)),
            fixedFee: Number(fixedFee.toFixed(2)),
            netAmount: Number(net.toFixed(2)),
            currency: balanceTransaction.currency.toUpperCase(),
            chargeId: charge.id,
            balanceTransactionId: balanceTransaction.id,
            feeDetails: balanceTransaction.fee_details || [],
            created: new Date(balanceTransaction.created * 1000),
        };
    } catch (error) {
        console.error('Error fetching Stripe payment fees:', error);
      throw error;
    }
};

/**
 * Get actual Stripe charges from a refund
 * @param {string} refundId - Stripe Refund ID
 * @returns {Object} Actual fee breakdown from refund
 */
const getStripeRefundFees = async refundId => {
    try {
        const refund = await stripe.refunds.retrieve(refundId);

        // Get the balance transaction for the refund
        if (!refund.balance_transaction) {
            // If no balance transaction, the original fee was not refunded
            const originalCharge = await stripe.charges.retrieve(refund.charge);
            const originalBalanceTransaction =
                await stripe.balanceTransactions.retrieve(
                    originalCharge.balance_transaction
                );

            const originalFee = originalBalanceTransaction.fee / 100;

            return {
                refundAmount: refund.amount / 100,
                originalFee: Number(originalFee.toFixed(2)),
                feeRefunded: 0,
                nonRefundableFee: Number(originalFee.toFixed(2)),
                currency: refund.currency.toUpperCase(),
                refundId: refund.id,
                chargeId: refund.charge,
                created: new Date(refund.created * 1000),
                description: 'Original processing fee (not refunded by Stripe)',
            };
        }

        const balanceTransaction = await stripe.balanceTransactions.retrieve(
            refund.balance_transaction
        );

        const refundAmount = Math.abs(balanceTransaction.amount) / 100;
        const fee = balanceTransaction.fee / 100;
        const net = balanceTransaction.net / 100;

        return {
            refundAmount: Number(refundAmount.toFixed(2)),
            fee: Number(fee.toFixed(2)),
            netRefund: Number(net.toFixed(2)),
            currency: balanceTransaction.currency.toUpperCase(),
            refundId: refund.id,
            chargeId: refund.charge,
            balanceTransactionId: balanceTransaction.id,
            feeDetails: balanceTransaction.fee_details || [],
            created: new Date(balanceTransaction.created * 1000),
            description:
                fee > 0
                    ? 'Refund processing fee'
                    : 'No additional fee for refund',
        };
    } catch (error) {
        console.error('Error fetching Stripe refund fees:', error);
        throw error;
    }
};

/**
 * Get actual Stripe charges from a transfer
 * @param {string} transferId - Stripe Transfer ID
 * @returns {Object} Actual fee breakdown from transfer
 */
const getStripeTransferFees = async transferId => {
    try {
        const transfer = await stripe.transfers.retrieve(transferId);

        // Get the balance transaction for the transfer
        if (!transfer.balance_transaction) {
            return {
                transferAmount: transfer.amount / 100,
                fee: 0,
                netTransfer: transfer.amount / 100,
                currency: transfer.currency.toUpperCase(),
                transferId: transfer.id,
                destination: transfer.destination,
                created: new Date(transfer.created * 1000),
                description: 'No transfer fee for standard Connect account',
            };
        }

        const balanceTransaction = await stripe.balanceTransactions.retrieve(
            transfer.balance_transaction
        );

        const amount = Math.abs(balanceTransaction.amount) / 100;
        const fee = balanceTransaction.fee / 100;
        const net = balanceTransaction.net / 100;

        return {
            transferAmount: Number(amount.toFixed(2)),
            fee: Number(fee.toFixed(2)),
            netTransfer: Number(net.toFixed(2)),
            currency: balanceTransaction.currency.toUpperCase(),
            transferId: transfer.id,
            destination: transfer.destination,
            balanceTransactionId: balanceTransaction.id,
            feeDetails: balanceTransaction.fee_details || [],
            created: new Date(balanceTransaction.created * 1000),
            description:
                fee > 0 ? 'Transfer processing fee' : 'No transfer fee',
        };
    } catch (error) {
        console.error('Error fetching Stripe transfer fees:', error);
        throw error;
    }
};

/**
 * Create a charge breakdown entry
 */
const createChargeBreakdown = (
    operation,
    amount,
    fee,
    stripeId,
    description,
    feeDetails = []
) => {
    return {
        operation,
        amount: Number(amount.toFixed(2)),
        fee: Number(fee.toFixed(2)),
        timestamp: new Date(),
        stripeId,
        description,
        feeDetails: feeDetails.map(detail => ({
            type: detail.type,
            amount: detail.amount / 100,
            currency: detail.currency,
            description: detail.description,
        })),
    };
};

module.exports = {
    getStripePaymentFees,
    getStripeRefundFees,
    getStripeTransferFees,
    createChargeBreakdown,
};
