sap.ui.define([
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Fragment, JSONModel, Filter, FilterOperator, MessageBox, MessageToast) {
    "use strict";

    // Module-level state: there is only ever one "Open Bookings" dialog open at a time.
    var oAnchor = null;        // the ListReport view, used to reach models
    var oRoutingApi = null;    // extensionAPI.routing, used to navigate to a Flight context
    var oDialog = null;
    var oDialogModel = null;
    var oNavContainer = null;
    var oFlightsPage = null;
    var oCreatePage = null;

    function toIsoDate(oDate) {
        var iYear = oDate.getFullYear();
        var iMonth = oDate.getMonth() + 1;
        var iDay = oDate.getDate();
        return iYear + "-" + (iMonth < 10 ? "0" : "") + iMonth + "-" + (iDay < 10 ? "0" : "") + iDay;
    }

    function getText(sKey, aArgs) {
        return oAnchor.getModel("i18n").getResourceBundle().getText(sKey, aArgs);
    }

    function closeDialog() {
        if (oDialog) {
            oDialog.close();
        }
    }

    // extensionAPI.routing.navigate() is the documented way to open a context's Object Page,
    // but we fall back to plain router navigation (by key segment) if it's ever unavailable,
    // rather than failing silently.
    function navigateToContext(oContext) {
        closeDialog();
        try {
            if (oRoutingApi && typeof oRoutingApi.navigate === "function") {
                oRoutingApi.navigate(oContext);
                return;
            }
            var oRouter = sap.ui.core.UIComponent.getRouterFor(oAnchor);
            var sKey = oContext.getPath().replace(/^\/Flights\(/, "").replace(/\)$/, "");
            oRouter.navTo("FlightsObjectPage", { key: sKey });
        } catch (oError) {
            MessageBox.error("Open Bookings: could not navigate to the flight"
                + (oError && oError.message ? ": " + oError.message : ""));
            // eslint-disable-next-line no-console
            console.error("OpenBookingsDialog: navigateToContext failed", oError);
        }
    }

    var oExtensionActions = {

        // ---------------------------------------------------------------
        // Entry point: table toolbar action "Open Bookings"
        // ---------------------------------------------------------------
        onOpenBookings: function () {
            try {
                oAnchor = typeof this.getView === "function" ? this.getView()
                    : (this.routing && this.routing.getView ? this.routing.getView() : null);
                oRoutingApi = this.routing;

                if (!oAnchor) {
                    MessageBox.error("Open Bookings: could not resolve the current view from the extension API.");
                    return;
                }

                oDialogModel = new JSONModel({
                    dateChosen: false,
                    selectedDate: null,
                    selectedDateDisplay: "",
                    busy: false,
                    flights: [],
                    noFlightsText: "",
                    newFlight: {
                        carrierID: "",
                        connectionID: "",
                        flightDate: "",
                        price: 0,
                        currencyCode: "USD",
                        plannedSeats: 0
                    }
                });

                Fragment.load({
                    name: "sap.fe.demo.flightsop.ext.fragment.OpenBookingsDialog",
                    controller: oExtensionActions
                }).then(function (oLoadedDialog) {
                    oDialog = oLoadedDialog;
                    oNavContainer = oDialog.getContent()[0];
                    oFlightsPage = oNavContainer.getPages()[1];
                    oCreatePage = oNavContainer.getPages()[2];

                    oAnchor.addDependent(oDialog);
                    oDialog.setModel(oDialogModel, "ob");
                    oDialog.open();
                }).catch(function (oError) {
                    MessageBox.error("Open Bookings: failed to load the dialog fragment"
                        + (oError && oError.message ? ": " + oError.message : ""));
                    // eslint-disable-next-line no-console
                    console.error("OpenBookingsDialog: Fragment.load failed", oError);
                });
            } catch (oError) {
                MessageBox.error("Open Bookings: " + (oError && oError.message ? oError.message : oError));
                // eslint-disable-next-line no-console
                console.error("OpenBookingsDialog: onOpenBookings failed", oError);
            }
        },

        // ---------------------------------------------------------------
        // Step 1: calendar
        // ---------------------------------------------------------------
        onCalendarDateSelected: function (oEvent) {
            var aSelectedDates = oEvent.getSource().getSelectedDates();
            var oDate = aSelectedDates.length ? aSelectedDates[0].getStartDate() : null;
            var sIsoDate = oDate ? toIsoDate(oDate) : null;

            oDialogModel.setProperty("/selectedDate", sIsoDate);
            oDialogModel.setProperty("/selectedDateDisplay", oDate ? oDate.toLocaleDateString() : "");
            oDialogModel.setProperty("/dateChosen", !!sIsoDate);
        },

        // ---------------------------------------------------------------
        // Step 2: flights available on the chosen date
        // ---------------------------------------------------------------
        onNavigateToFlightsPage: function () {
            var sIsoDate = oDialogModel.getProperty("/selectedDate");
            var oModel = oAnchor.getModel();

            oDialogModel.setProperty("/busy", true);
            oDialogModel.setProperty("/newFlight/flightDate", sIsoDate);
            oNavContainer.to(oFlightsPage);

            // Only active (non-draft) flights should show up as pre-existing bookings for that date.
            var aFilters = [
                new Filter("flightDate", FilterOperator.EQ, sIsoDate),
                new Filter("IsActiveEntity", FilterOperator.EQ, true)
            ];
            var oListBinding = oModel.bindList("/Flights", undefined, [], aFilters);

            oListBinding.requestContexts(0, 100).then(function (aContexts) {
                var aFlights = aContexts.map(function (oContext) {
                    var oData = oContext.getObject();
                    var iMax = oData.plannedSeats || 0;
                    var iOcc = oData.bookedSeats || 0;
                    var iAvailable = typeof oData.seatsAvailable === "number" ? oData.seatsAvailable : (iMax - iOcc);
                    oData.seatsAvailableText = getText("openBookingsSeatsAvailable", [iAvailable, iMax]);
                    // kept alongside the plain data so the row can navigate back to its real context
                    oData.__context = oContext;
                    return oData;
                });

                oDialogModel.setProperty("/flights", aFlights);
                oDialogModel.setProperty("/noFlightsText", getText("openBookingsNoFlights", [oDialogModel.getProperty("/selectedDateDisplay")]));
                oDialogModel.setProperty("/busy", false);
            }).catch(function (oError) {
                oDialogModel.setProperty("/flights", []);
                oDialogModel.setProperty("/noFlightsText", getText("openBookingsNoFlights", [oDialogModel.getProperty("/selectedDateDisplay")]));
                oDialogModel.setProperty("/busy", false);
                MessageBox.error(getText("openBookingsLoadError") + (oError && oError.message ? ": " + oError.message : ""));
            });
        },

        onFlightItemPress: function (oEvent) {
            var oData = oEvent.getSource().getBindingContext("ob").getObject();
            navigateToContext(oData.__context);
        },

        // ---------------------------------------------------------------
        // Step 3: no flight found -> create one
        // ---------------------------------------------------------------
        onNavigateToCreatePage: function () {
            oNavContainer.to(oCreatePage);
        },

        onSaveNewFlight: function () {
            var oModel = oAnchor.getModel();
            var oNewFlight = oDialogModel.getProperty("/newFlight");

            if (!oNewFlight.carrierID || !oNewFlight.connectionID) {
                MessageBox.warning(getText("openBookingsFieldCarrier") + " / " + getText("openBookingsFieldConnection"));
                return;
            }

            oDialogModel.setProperty("/busy", true);

            var oListBinding = oModel.bindList("/Flights");
            var oNewContext;

            try {
                oNewContext = oListBinding.create({
                    carrierID: String(oNewFlight.carrierID).toUpperCase(),
                    connectionID: String(oNewFlight.connectionID),
                    flightDate: oNewFlight.flightDate,
                    price: parseFloat(oNewFlight.price) || 0,
                    currency_code: oNewFlight.currencyCode,
                    plannedSeats: parseInt(oNewFlight.plannedSeats, 10) || 0,
                    bookedSeats: 0
                });
            } catch (oError) {
                oDialogModel.setProperty("/busy", false);
                MessageBox.error(getText("openBookingsCreateError") + (oError && oError.message ? ": " + oError.message : ""));
                return;
            }

            oNewContext.created().then(function () {
                oDialogModel.setProperty("/busy", false);
                MessageToast.show(getText("openBookingsCreateSuccess"));
                navigateToContext(oNewContext);
            }).catch(function (oError) {
                oDialogModel.setProperty("/busy", false);
                MessageBox.error(getText("openBookingsCreateError") + (oError && oError.message ? ": " + oError.message : ""));
            });
        },

        // ---------------------------------------------------------------
        // Shared dialog navigation / lifecycle
        // ---------------------------------------------------------------
        onNavigateBack: function () {
            oNavContainer.back();
        },

        onOpenBookingsCancel: function () {
            closeDialog();
        },

        onOpenBookingsDialogAfterClose: function (oEvent) {
            oEvent.getSource().destroy();
            oDialog = null;
            oDialogModel = null;
            oNavContainer = null;
            oFlightsPage = null;
            oCreatePage = null;
        }
    };

    return oExtensionActions;
});
