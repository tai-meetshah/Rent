const router = require('express').Router();

const AdminCommission = require('../../models/AdminCommission');

router.get('/commission', async (req, res) => {
    //     const commission = await AdminCommission.findOne();
    //   res.render("admin/commission", { title: "Commission Settings", commission });

    const commission = await AdminCommission.findOne();
    res.render('commission', {
        title: 'Commission Settings',
        commission,
    });
});

// 🔹 Create Commission Setting
router.post('/commission', async (req, res) => {
    try {
        const {
            commissionType,
            firstUserDiscount,
            fixedAmount,
            percentage,
            subscriptionAmount,
            advertisementPricePerDay,
        } = req.body;

        let commission = await AdminCommission.findOne();
        if (commission) {
            // update existing advertisementPricePerDay
            commission.advertisementPricePerDay = advertisementPricePerDay;
            commission.firstUserDiscount = firstUserDiscount;
            commission.commissionType = commissionType;
            commission.fixedAmount = fixedAmount;
            commission.percentage = percentage;
            commission.subscriptionAmount = subscriptionAmount;
            await commission.save();
        } else {
            // create new
            commission = new AdminCommission({
                commissionType,
                fixedAmount,
                percentage,
                subscriptionAmount,
                firstUserDiscount,
            });
            await commission.save();
        }
        req.flash('green', 'Commission updated successfully.');
        res.redirect('/admin/commission');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin');
    }
});

// 🔹 Get All Commission Settings
router.get('/', async (req, res) => {
    try {
        const commissions = await AdminCommission.find().sort({
            createdAt: -1,
        });
        res.status(200).json(commissions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 🔹 Get Commission by ID
router.get('/:id', async (req, res) => {
    try {
        const commission = await AdminCommission.findById(req.params.id);
        if (!commission) return res.status(404).json({ message: 'Not found' });
        res.status(200).json(commission);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 🔹 Update Commission
router.put('/:id', async (req, res) => {
    try {
        const {
            commissionType,
            fixedAmount,
            percentage,
            isActive,
            subscriptionAmount,
            firstUserDiscount,
            advertisementPricePerDay,
        } = req.body;
        const updated = await AdminCommission.findByIdAndUpdate(
            req.params.id,
            {
                commissionType,
                fixedAmount,
                firstUserDiscount,
                advertisementPricePerDay,
                percentage,
                isActive,
                subscriptionAmount,
            },
            { new: true }
        );
        if (!updated) return res.status(404).json({ message: 'Not found' });
        res.status(200).json({
            message: 'Updated successfully',
            data: updated,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 🔹 Delete Commission
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await AdminCommission.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ message: 'Not found' });
        res.status(200).json({ message: 'Deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
