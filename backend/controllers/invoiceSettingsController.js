const prisma = require("../config/prisma");

/**
 * Get Invoice Settings for a specific type (sales, return)
 */
exports.getInvoiceSettings = async (req, res) => {
    try {
        const { type } = req.query;
        if (!type) {
            return res.status(400).json({ error: "Type is required (sales or return)" });
        }

        // Safety check: Ensure prisma client has the model
        if (!prisma.invoiceSetting) {
            console.error("❌ [DB] InvoiceSetting model not found in Prisma client");
            return res.json({ type, settings: null, warning: "Model sync in progress" });
        }

        const settings = await prisma.invoiceSetting.findUnique({
            where: { type }
        });

        if (!settings) {
            return res.json({ type, settings: null });
        }

        res.json(settings);
    } catch (error) {
        console.error("❌ [ERROR] Fetching invoice settings:", error.message);
        res.status(500).json({ 
            error: "Internal Server Error", 
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * Update or Create Invoice Settings
 */
exports.updateInvoiceSettings = async (req, res) => {
    try {
        const { type, settings } = req.body;

        if (!type || !settings) {
            return res.status(400).json({ error: "Type and settings are required" });
        }

        if (!prisma.invoiceSetting) {
            console.error("❌ [DB] InvoiceSetting model not found in Prisma client during update");
            return res.status(503).json({ error: "Service Unavailable: Database model sync in progress" });
        }

        const updated = await prisma.invoiceSetting.upsert({
            where: { type },
            update: { settings },
            create: { type, settings }
        });

        // Also synchronize to CompanyProfile if type is sales
        if (type === 'sales') {
            try {
                const comp = await prisma.companyProfile.findFirst();
                if (comp) {
                    await prisma.companyProfile.update({
                        where: { id: comp.id },
                        data: { invoiceSettings: settings }
                    });
                }
            } catch (syncErr) {
                console.warn("⚠️ Could not sync invoice settings to CompanyProfile:", syncErr.message);
            }
        }

        res.json(updated);
    } catch (error) {
        console.error("❌ [ERROR] Updating invoice settings:", error.message);
        res.status(500).json({ 
            error: "Internal Server Error", 
            message: error.message 
        });
    }
};
