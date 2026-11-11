package services

import (
	"supermercado-inventory-api/internal/repository"
)

// SalesReportResponse es la respuesta completa del reporte de ventas (HU028).
type SalesReportResponse struct {
	KPIs        repository.ReportKPIs       `json:"kpis"`
	TopProducts []repository.TopProduct     `json:"top_products"`
	Rows        []repository.SalesReportRow `json:"rows"`
}

// InventoryReportResponse es el reporte de inventario valorizado.
type InventoryReportResponse struct {
	TotalProductos  int                             `json:"total_productos"`
	TotalUnidades   int                             `json:"total_unidades"`
	ValorCosto      float64                         `json:"valor_costo"`
	ValorVenta      float64                         `json:"valor_venta"`
	StockBajo       int                             `json:"stock_bajo"`
	Vencidos        int                             `json:"vencidos"`
	PorVencer       int                             `json:"por_vencer"`
	Rows            []repository.InventoryReportRow `json:"rows"`
	ExpiryAlertDays int                             `json:"expiry_alert_days"`
}

// StaffReportResponse es el reporte de personal del período.
type StaffReportResponse struct {
	TotalPersonal int                         `json:"total_personal"`
	Activos       int                         `json:"activos"`
	Rows          []repository.StaffReportRow `json:"rows"`
}

// ReportService consolida la información para los reportes de ventas,
// inventario y personal por período (RF-12 / CU-08).
type ReportService interface {
	GetSalesReport(f repository.SalesFilter) (*SalesReportResponse, error)
	GetInventoryReport(venueID *uint) (*InventoryReportResponse, error)
	GetStaffReport(f repository.SalesFilter) (*StaffReportResponse, error)
}

type reportService struct {
	reportRepo repository.ReportRepository
}

// NewReportService inyecta el ReportRepository.
func NewReportService(reportRepo repository.ReportRepository) ReportService {
	return &reportService{reportRepo: reportRepo}
}

// GetSalesReport consolida KPIs, top products y filas de detalle en una sola respuesta.
func (s *reportService) GetSalesReport(f repository.SalesFilter) (*SalesReportResponse, error) {
	kpis, err := s.reportRepo.GetKPIs(f)
	if err != nil {
		return nil, err
	}
	top, err := s.reportRepo.GetTopProducts(f)
	if err != nil {
		return nil, err
	}
	rows, err := s.reportRepo.GetRows(f)
	if err != nil {
		return nil, err
	}
	if top == nil {
		top = []repository.TopProduct{}
	}
	if rows == nil {
		rows = []repository.SalesReportRow{}
	}
	return &SalesReportResponse{KPIs: kpis, TopProducts: top, Rows: rows}, nil
}

func (s *reportService) GetInventoryReport(venueID *uint) (*InventoryReportResponse, error) {
	rows, err := s.reportRepo.GetInventory(venueID)
	if err != nil {
		return nil, err
	}
	resp := &InventoryReportResponse{Rows: rows, ExpiryAlertDays: ExpiryWarningDays}
	if resp.Rows == nil {
		resp.Rows = []repository.InventoryReportRow{}
	}
	for _, r := range rows {
		resp.TotalProductos++
		resp.TotalUnidades += r.StockActual
		resp.ValorCosto += r.ValorCosto
		resp.ValorVenta += r.ValorVenta
		if r.StockActual <= r.StockMinimo {
			resp.StockBajo++
		}
		if r.DiasRestantes != nil {
			if *r.DiasRestantes < 0 {
				resp.Vencidos++
			} else if *r.DiasRestantes <= ExpiryWarningDays {
				resp.PorVencer++
			}
		}
	}
	return resp, nil
}

func (s *reportService) GetStaffReport(f repository.SalesFilter) (*StaffReportResponse, error) {
	rows, err := s.reportRepo.GetStaff(f)
	if err != nil {
		return nil, err
	}
	resp := &StaffReportResponse{Rows: rows}
	if resp.Rows == nil {
		resp.Rows = []repository.StaffReportRow{}
	}
	for _, r := range rows {
		resp.TotalPersonal++
		if r.Activo {
			resp.Activos++
		}
	}
	return resp, nil
}
