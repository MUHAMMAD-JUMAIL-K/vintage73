const prisma = require('../config/prisma');
const asyncHandler = require('../middleware/asyncHandler');

// Get Company Profile
exports.getCompanyProfile = asyncHandler(async (req, res) => {
  let company = await prisma.companyProfile.findFirst({
    include: { bank: true }
  });

  // If no company profile exists, create a default one
  if (!company) {
    company = await prisma.companyProfile.create({
      data: {
        companyName: 'Pillow Spot',
        address: '',
        city: '',
        state: '',
        pincode: '',
        phone: '',
        email: '',
        website: '',
        registrationNumber: '',
        logoUrl: '',
        currencyCode: 'AED',
        currencySymbol: 'AED',
        country: 'United Arab Emirates',
        taxSystem: 'VAT',
        showOnlyLogoOnDashboard: true,
      }
    });
  }

  res.json(company);
});

// Update Company Profile
exports.updateCompanyProfile = asyncHandler(async (req, res) => {
  // Extract fields - undefined if not present in JSON/FormData
  const {
    companyName, address, city, state, pincode, phone, email, website, registrationNumber,
    currencyCode, currencySymbol, country, taxSystem, bankId,
    primaryColor, secondaryColor, gradientType
  } = req.body;

  let logoUrl = req.body.logoUrl;
  let dashboardImageUrl = req.body.dashboardImageUrl;

  if (req.files) {
    if (req.files['logo']) {
      logoUrl = `/uploads/${req.files['logo'][0].filename}`;
    }
    if (req.files['dashboardImage']) {
      dashboardImageUrl = `/uploads/${req.files['dashboardImage'][0].filename}`;
    }
  }

  const company = await prisma.companyProfile.findFirst();

  // Dynamically build data object to allow partial updates
  const data = {};

  // String fields - directly assign if defined
  if (companyName !== undefined) data.companyName = companyName;
  if (address !== undefined) data.address = address;
  if (city !== undefined) data.city = city;
  if (state !== undefined) data.state = state;
  if (pincode !== undefined) data.pincode = pincode;
  if (phone !== undefined) data.phone = phone;
  if (email !== undefined) data.email = email;
  if (website !== undefined) data.website = website;
  if (registrationNumber !== undefined) data.registrationNumber = registrationNumber;

  // Theme & Settings
  if (primaryColor) data.primaryColor = primaryColor;
  if (secondaryColor) data.secondaryColor = secondaryColor;
  if (gradientType) data.gradientType = gradientType;
  if (currencyCode !== undefined) data.currencyCode = currencyCode;
  if (currencySymbol !== undefined) data.currencySymbol = currencySymbol;
  if (country !== undefined) data.country = country;
  if (taxSystem !== undefined) data.taxSystem = taxSystem;

  // Computed / Boolean fields
  if (req.body.showOnlyLogoOnDashboard !== undefined) {
    data.showOnlyLogoOnDashboard = req.body.showOnlyLogoOnDashboard === 'true' || req.body.showOnlyLogoOnDashboard === true;
  }

  if (bankId !== undefined) {
    data.bankId = bankId ? parseInt(bankId) : null;
  }

  // Images
  if (logoUrl !== undefined) data.logoUrl = logoUrl;
  if (dashboardImageUrl !== undefined) data.dashboardImageUrl = dashboardImageUrl;

  // Explicit removal flags
  if (req.body.removeDashboardImage === 'true' || req.body.removeDashboardImage === true) {
    data.dashboardImageUrl = null;
  }

  if (company) {
    const updated = await prisma.companyProfile.update({
      where: { id: company.id },
      data,
    });
    res.json(updated);
  } else {
    // Create - requires minimum fields, or defaults will take over if we didn't populate data
    if (!data.companyName) data.companyName = 'New Company'; // Fallback

    const newCompany = await prisma.companyProfile.create({
      data,
    });
    res.json(newCompany);
  }
});
